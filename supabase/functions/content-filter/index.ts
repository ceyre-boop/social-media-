/**
 * content-filter — the pre-publish gate for live chat, DMs and comments (brief M3 §5, policy v0.2
 * speech dial).
 *
 *   POST { text, context: { surface: 'live_chat'|'dm'|'comment', stream_id?, post_id?,
 *                           parent_comment_id?, recipient_id?, sender_id? } }
 *     -> { tier, action, grade, required_level, ceiling, room_level, relationship, message,
 *          reasons, event_id, latency_ms, timings }
 *   POST { mode: 'override', event_id }   the sender chose "Send as is" on a YELLOW (30-day signal)
 *   POST { mode: 'embed', texts: [...] }  service role only: gte-small vectors (precompute script)
 *
 * Runs the shared pipeline (src/lib/contentFilter): stage A rules, then stage B k-NN with
 * Supabase's built-in gte-small, then room level / relationship / harassment counter. The sender is
 * the JWT subject (the gateway verifies the JWT); a body sender_id is only honoured for the service
 * role.
 *
 * The room level is the creator's (live_streams.room_level, posts.room_level); for a DM, or a reply
 * to a comment, it is also capped by what the recipient accepts (users.speech_level). The person
 * addressed ("target") is the DM recipient, the replied-to comment's author, the post's author, or
 * the stream's host. Hostile messages to the same target bump ops.content_filter_pair_counts; the
 * count inside the window makes repeated targeting ORANGE (harassing).
 *
 * GREEN is never logged. RED is logged with its body and queued for human review (awaited);
 * YELLOW / ORANGE are logged without the body after the response (EdgeRuntime.waitUntil).
 * The client stores `required_level` on the row it writes, so viewers can hide / mask above
 * their own level.
 */
import postgres from 'npm:postgres@3.4.7';

import { senderMessage } from '../../../src/lib/contentFilter/copy.ts';
import { evaluate, HARASSMENT_WINDOW_MINUTES, type StageBDeps } from '../../../src/lib/contentFilter/pipeline.ts';
import embeddingsDoc from '../../../src/lib/contentFilter/rules/examples.embeddings.json' with { type: 'json' };
import examplesDoc from '../../../src/lib/contentFilter/rules/examples.json' with { type: 'json' };
import {
  type EmbeddingsDoc,
  examplesFingerprint,
  indexFromEmbeddings,
  type LabelledExample,
  STAGE_B_CONFIG,
} from '../../../src/lib/contentFilter/stageB.ts';
import type { EvalContext, Relationship, SpeechLevel, Surface } from '../../../src/lib/contentFilter/types.ts';
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
  room_level: SpeechLevel | null;
  target_id: string | null;
  trusted: boolean;
  relationship: Relationship;
  prior: number;
  sender_adult: boolean | null;
  target_minor: boolean | null;
};

const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

async function lookup(
  sender: string,
  surface: Surface,
  ids: { stream: string | null; post: string | null; parent: string | null; recipient: string | null },
): Promise<Lookup> {
  const [row] = await sql()`
    with t as (
      select case
        when ${surface} = 'dm' then ${ids.recipient}::uuid
        when ${surface} = 'comment' then coalesce(
          (select c.author_id from public.comments c where c.id = ${ids.parent}::uuid),
          (select p.author_id from public.posts p where p.id = ${ids.post}::uuid))
        else (select s.host_id from public.live_streams s where s.id = ${ids.stream}::uuid)
      end as target_id
    ),
    room as (
      select case
        when ${surface} = 'live_chat' then (select s.room_level from public.live_streams s where s.id = ${ids.stream}::uuid)
        when ${surface} = 'comment' then (select p.room_level from public.posts p where p.id = ${ids.post}::uuid)
        else null
      end as creator_level
    )
    select
      -- the creator's room, capped by what the person addressed accepts (DMs and replies)
      (select case
         when ${surface} = 'dm' then (select u.speech_level from public.users u where u.id = t.target_id)
         when ${surface} = 'comment' and ${ids.parent}::uuid is not null then
           least(room.creator_level, (select u.speech_level from public.users u where u.id = t.target_id))
         else room.creator_level
       end)::text as room_level,
      t.target_id,
      exists (select 1 from public.trusted_circle_members m
                join public.live_streams s on s.host_id = m.creator_id
               where s.id = ${ids.stream}::uuid and m.member_id = ${sender}::uuid) as trusted,
      case
        when t.target_id is null then 'strangers'
        when exists (select 1 from public.friendships f
                      where f.user_a_id = least(${sender}::uuid, t.target_id)
                        and f.user_b_id = greatest(${sender}::uuid, t.target_id)
                        and f.state = 'accepted') then 'friends'
        when exists (select 1 from public.follows a where a.follower_id = ${sender}::uuid and a.followee_id = t.target_id)
         and exists (select 1 from public.follows b where b.follower_id = t.target_id and b.followee_id = ${sender}::uuid) then 'mutual'
        else 'strangers'
      end as relationship,
      coalesce((select pc.hits from ops.content_filter_pair_counts pc
                 where pc.sender_id = ${sender}::uuid and pc.target_id = t.target_id
                   and pc.window_start > now() - make_interval(mins => ${HARASSMENT_WINDOW_MINUTES})), 0)::int as prior,
      (select date_of_birth <= current_date - interval '18 years' from public.users where id = ${sender}::uuid) as sender_adult,
      -- Unknown recipient age counts as a minor (the safer side); only for DMs.
      case when ${surface} <> 'dm' or t.target_id is null then null
           else coalesce((select date_of_birth > current_date - interval '18 years'
                            from public.users where id = t.target_id), true) end as target_minor
    from t, room`;
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
  const ids = {
    stream: uuidOrNull(ctxIn.stream_id),
    post: uuidOrNull(ctxIn.post_id),
    parent: uuidOrNull(ctxIn.parent_comment_id),
    recipient: uuidOrNull(ctxIn.recipient_id),
  };

  const facts = await lookup(sender, surface, ids);
  const ctx: EvalContext = {
    surface,
    roomLevel: facts.room_level ?? undefined,
    relationship: facts.relationship,
    senderTrusted: facts.trusted,
    priorTargetedCount: facts.prior,
    senderIsAdult: facts.sender_adult ?? undefined,
    recipientIsMinor: facts.target_minor ?? undefined,
  };
  const verdict = await evaluate(text, ctx, stageB);
  const latency = Math.round(performance.now() - t0);

  // Count hostile messages per sender -> target (window resets after HARASSMENT_WINDOW_MINUTES).
  if (verdict.hostileTargeted && facts.target_id && facts.target_id !== sender) {
    EdgeRuntime.waitUntil(
      sql()`select ops.content_filter_bump_pair(${sender}::uuid, ${facts.target_id}::uuid, ${HARASSMENT_WINDOW_MINUTES})`.catch(
        (e: unknown) => console.error('content-filter counter failed', e),
      ),
    );
  }

  let eventId: string | null = null;
  if (verdict.tier !== 'GREEN') {
    eventId = crypto.randomUUID();
    const write = sql()`
      insert into ops.content_filter_events
        (id, surface, sender_id, stream_id, tier, raw_tier, reason_codes, policy_refs, latency_ms, body, required_level)
      values (${eventId}::uuid, ${surface}, ${sender}::uuid, ${ids.stream}::uuid,
              ${verdict.tier}::ops.content_filter_tier, ${verdict.ceiling ?? verdict.tier}::ops.content_filter_tier,
              ${verdict.reasons.map((r) => r.code)}, ${verdict.reasons.map((r) => r.policyRef)},
              ${latency}, ${verdict.tier === 'RED' ? text : null}, ${verdict.requiredLevel}::public.speech_level)`;
    if (verdict.tier === 'RED') await write;
    else EdgeRuntime.waitUntil(write.catch((e: unknown) => console.error('content-filter log failed', e)));
  }

  return Response.json({
    tier: verdict.tier,
    action: verdict.action,
    grade: verdict.grade,
    required_level: verdict.requiredLevel,
    ceiling: verdict.ceiling,
    room_level: verdict.room.level,
    relationship: facts.relationship,
    message: senderMessage(verdict),
    reasons: verdict.reasons,
    event_id: eventId,
    latency_ms: latency,
    timings: verdict.timings,
  });
});
