/**
 * Shared shell for scheduled Edge Functions: service-role auth, a direct database connection
 * (the `ops` schema is not exposed through the API), and a row in ops.job_runs per invocation.
 */
import postgres from 'npm:postgres@3.4.7';

export type Sql = ReturnType<typeof postgres>;

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isServiceRole(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  return sameSecret(auth.replace(/^Bearer\s+/i, ''), key);
}

export function expoConfig() {
  return {
    base: (Deno.env.get('EXPO_PUSH_API_URL') ?? 'https://exp.host/--/api/v2/push').replace(/\/$/, ''),
    accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') || undefined,
  };
}

/** Serves a job: authenticates, connects, logs the run (ok with detail, or error), responds JSON. */
export function serveJob(
  name: string,
  run: (sql: Sql, body: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  Deno.serve(async (req) => {
    if (!isServiceRole(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) return Response.json({ error: 'SUPABASE_DB_URL missing' }, { status: 500 });
    const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
    let runId: string | undefined;
    try {
      [{ id: runId }] = await sql`select ops.start_run(${name}) as id`;
      const detail = await run(sql, body);
      await sql`select ops.finish_run(${runId}, 'ok', ${sql.json(detail)})`;
      return Response.json({ ok: true, ...detail });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (runId) {
        await sql`select ops.finish_run(${runId}, 'error', ${sql.json({ error: message })})`.catch(() => {});
      }
      console.error(`${name}:`, message);
      return Response.json({ ok: false, error: message }, { status: 500 });
    } finally {
      await sql.end({ timeout: 2 });
    }
  });
}
