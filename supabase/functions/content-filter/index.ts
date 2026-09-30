/**
 * content-filter — the pre-publish gate for live chat, DMs and comments (brief M3 §5).
 *
 *   POST { text, context: { surface: 'live_chat'|'dm'|'comment', stream_id?, sender_id?, recipient_id? } }
 *     -> { tier, raw_tier, action, reasons, hold, event_id, latency_ms, timings }
 *   POST { mode: 'override', event_id }   the sender chose "Send as is" on a YELLOW (30-day signal)
 *   POST { mode: 'embed', texts: [...] }  service role only: gte-small vectors (precompute script)
 *
 * Runs the shared pipeline (src/lib/contentFilter): stage A rules, then stage B k-NN with
 * Supabase's built-in gte-small, then creator strictness / Trusted Circle. The sender is the JWT
 * subject (the gateway verifies the JWT); a body sender_id is only honoured for the service role.
 * GREEN is never logged. RED is logged with its body and queued for human review (awaited);
 * YELLOW / ORANGE are logged without the body after the response (EdgeRuntime.waitUntil).
 */
import postgres from 'npm:postgres@3.4.7';

import { evaluate, type StageBDeps } from '../../../src/lib/contentFilter/pipeline.ts';
import embeddingsDoc from '../../../src/lib/contentFilter/rules/examples.embeddings.json' with { type: 'json' };
import examplesDoc from '../../../src/lib/contentFilter/rules/examples.json' with { type: 'json' };
import {
  type EmbeddingsDoc,
  examplesFingerprint,
  indexFromEmbeddings,
  type LabelledExample,
  STAGE_B_CONFIG,
} from '../../../src/lib/contentFilter/stageB.ts';
import type { EvalContext, Surface } from '../../../src/lib/contentFilter/types.ts';
import { isServiceRole } from '../_shared/job.ts';

type AiSession = { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<unknown> };
declare const Supabase: { ai: { Session: new (model: string) => AiSession } };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MAX_LEN = 2000;
const SURFACES: readonly Surface[] = ['live_chat', 'dm', 'comment'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const session = new Supabase.ai.Session('gte-small');
const embed = async (text: string) => (await session.run(text, { mean_pool: true, normalize: true })) as number[];

const examples = examplesDoc.examples as LabelledExample[];
const doc = embeddingsDoc as unknown as EmbeddingsDoc;

/** Stale or missing example vectors disable stage B (stage A still runs) rather than failing. */
function buildStageB(): StageBDeps | null {
  if (doc.examples_fingerprint !== examplesFingerprint(examples)) {
    console.warn('content-filter: examples.embeddings.json is stale; stage B off. Run scripts/content-filter-embed.ts');
    return null;
  }
  return { embed, index: indexFromEmbeddings(examples, doc), config: STAGE_B_CONFIG['gte-small'] };
}
const stageB = buildStageB();

let sqlConn: ReturnType<typeof postgres> | null = null;
function sql() {
  if (!sqlConn) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL missing');
    sqlConn = postgres(url, { max: 3, prepare: false, idle_timeout: 30 });
  }
  return sqlConn;
}

/** The gateway has verified the JWT; we only read its subject. */
function jwtSub(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' && UUID.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

type Lookup = {
  strictness: 'open' | 'standard' | 'protected' | null;
  trusted: boolean;
  age_days: number | null;
  sender_adult: boolean | null;
  recipient_minor: boolean | null;
};

async function lookup(sender: string, stream: string | null, recipient: string | null): Promise<Lookup> {
  const [row] = await sql()`
    select
      (select chat_strictness::text from public.live_streams where id = ${stream}::uuid) as strictness,
      exists (select 1 from public.trusted_circle_members t
                join public.live_streams s on s.host_id = t.creator_id
               where s.id = ${stream}::uuid and t.member_id = ${sender}::uuid) as trusted,
      (select extract(epoch from now() - created_at) / 86400 from public.users where id = ${sender}::uuid)::float8 as age_days,
      (select date_of_birth <= current_date - interval '18 years' from public.users where id = ${sender}::uuid) as sender_adult,
      -- Unknown recipient age counts as a minor (the safer side).
      case when ${recipient}::uuid is null then null
           else coalesce((select date_of_birth > current_date - interval '18 years'
                            from public.users where id = ${recipient}::uuid), true) end as recipient_minor`;
  return row as unknown as Lookup;
}

Deno.serve(async (req) => {
  const t0 = performance.now();
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'invalid_json' }, { status: 400 });
  const service = isServiceRole(req);

  if (body.mode === 'embed') {
    if (!service) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const texts = Array.isArray(body.texts) ? (body.texts as unknown[]).map(String) : [];
    const vectors: number[][] = [];
    for (const t of texts) vectors.push(Array.from(await embed(t)));
    return Response.json({ model: 'gte-small', dim: vectors[0]?.length ?? 0, vectors });
  }

  const sub = jwtSub(req);
  const ctxIn = (body.context ?? {}) as Record<string, unknown>;
  const claimed = typeof ctxIn.sender_id === 'string' ? ctxIn.sender_id : null;
  const sender = service ? claimed : sub;
  if (!sender || !UUID.test(sender)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!service && claimed && claimed !== sub) return Response.json({ error: 'sender_mismatch' }, { status: 403 });

  if (body.mode === 'override') {
    const id = String(body.event_id ?? '');
    if (!UUID.test(id)) return Response.json({ error: 'invalid_event_id' }, { status: 400 });
    const rows = await sql()`
      update ops.content_filter_events set yellow_overridden_at = now()
       where id = ${id}::uuid and sender_id = ${sender}::uuid and tier = 'YELLOW' and yellow_overridden_at is null
      returning id`;
    return Response.json({ ok: rows.length === 1 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  const surface = ctxIn.surface as Surface;
  if (!text || text.length > MAX_LEN) return Response.json({ error: 'invalid_text' }, { status: 400 });
  if (!SURFACES.includes(surface)) return Response.json({ error: 'invalid_surface' }, { status: 400 });
  const stream = typeof ctxIn.stream_id === 'string' && UUID.test(ctxIn.stream_id) ? ctxIn.stream_id : null;
  const recipient = typeof ctxIn.recipient_id === 'string' && UUID.test(ctxIn.recipient_id) ? ctxIn.recipient_id : null;

  const facts = await lookup(sender, stream, recipient);
  const ctx: EvalContext = {
    surface,
    strictness: facts.strictness ?? undefined,
    senderTrusted: facts.trusted,
    senderAccountAgeDays: facts.age_days ?? undefined,
    senderIsAdult: facts.sender_adult ?? undefined,
    recipientIsMinor: facts.recipient_minor ?? undefined,
  };
  const verdict = await evaluate(text, ctx, stageB);
  const latency = Math.round(performance.now() - t0);

  let eventId: string | null = null;
  if (verdict.tier !== 'GREEN') {
    eventId = crypto.randomUUID();
    const write = sql()`
      insert into ops.content_filter_events
        (id, surface, sender_id, stream_id, tier, raw_tier, reason_codes, policy_refs, latency_ms, body)
      values (${eventId}::uuid, ${surface}, ${sender}::uuid, ${stream}::uuid,
              ${verdict.tier}::ops.content_filter_tier, ${verdict.rawTier}::ops.content_filter_tier,
              ${verdict.reasons.map((r) => r.code)}, ${verdict.reasons.map((r) => r.policyRef)},
              ${latency}, ${verdict.tier === 'RED' ? text : null})`;
    if (verdict.tier === 'RED') await write;
    else EdgeRuntime.waitUntil(write.catch((e: unknown) => console.error('content-filter log failed', e)));
  }

  return Response.json({
    tier: verdict.tier,
    raw_tier: verdict.rawTier,
    action: verdict.action,
    reasons: verdict.reasons,
    hold: verdict.hold,
    event_id: eventId,
    latency_ms: latency,
    timings: verdict.timings,
  });
});
