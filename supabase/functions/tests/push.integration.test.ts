/**
 * Push pipeline integration test: real local database, real Edge Functions (served by
 * `supabase functions serve`), and a stub Expo Push API on the host.
 *
 * Run with `bun run test:push` (scripts/test-push.ts starts the functions with
 * supabase/functions/.env.test, which points EXPO_PUSH_API_URL at this stub). Skipped under a
 * plain `bun test`.
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { notificationCopy } from '../../../src/lib/push/copy.ts';

const ENABLED = process.env.PUSH_ITEST === '1';
const suite = ENABLED ? describe : describe.skip;

const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FUNCTIONS_URL = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1';
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? '';
const STUB_PORT = Number(process.env.EXPO_STUB_PORT ?? 54399);

const RUN = crypto.randomUUID().slice(0, 8);
const token = (label: string) => `ExponentPushToken[itest-${label}-${RUN}]`;

type ExpoMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };

// ---------------------------------------------------------------- stub Expo Push API
const sent: ExpoMessage[] = [];
const ticketToToken = new Map<string, string>();
let stub: ReturnType<typeof Bun.serve> | undefined;

function startStub() {
  stub = Bun.serve({
    port: STUB_PORT,
    hostname: '0.0.0.0',
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith('/send')) {
        const messages = (await req.json()) as ExpoMessage[];
        if (messages.length > 100) return new Response('too many', { status: 400 });
        const data = messages.map((m) => {
          sent.push(m);
          if (m.to.includes('Unregistered')) {
            return {
              status: 'error',
              message: `"${m.to}" is not a registered push notification recipient`,
              details: { error: 'DeviceNotRegistered' },
            };
          }
          const id = `ticket-${crypto.randomUUID()}`;
          ticketToToken.set(id, m.to);
          return { status: 'ok', id };
        });
        return Response.json({ data });
      }
      if (url.pathname.endsWith('/getReceipts')) {
        const { ids } = (await req.json()) as { ids: string[] };
        const data: Record<string, unknown> = {};
        for (const id of ids) {
          const to = ticketToToken.get(id);
          if (!to) continue;
          data[id] = to.includes('GoneLater')
            ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok' };
        }
        return Response.json({ data });
      }
      return new Response('not found', { status: 404 });
    },
  });
}

// ---------------------------------------------------------------- helpers
const sql = new SQL(DB_URL);
const users: Record<string, string> = {};

async function makeUser(label: string, tok: string) {
  const id = crypto.randomUUID();
  users[label] = id;
  await sql`
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated',
            ${`itest-${label}-${RUN}@example.com`},
            ${{ date_of_birth: "1990-01-01", timezone: "UTC" }}::jsonb)`;
  // No quiet hours by default, so the test does not depend on the time of day.
  await sql`update public.users set quiet_start = '00:00', quiet_end = '00:00' where id = ${id}`;
  await sql`insert into public.devices (user_id, platform, push_token) values (${id}, 'ios', ${tok})`;
  return id;
}

async function notify(userId: string, type: string, ref: string, data: object = {}) {
  await sql`select ops.notify(${userId}::uuid, ${type}::public.notification_type, ${ref}, ${data}::jsonb)`;
}

async function call(fn: string, body: object = {}) {
  const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${fn} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const sentTo = (tok: string) => sent.filter((m) => m.to === tok);

async function jobFor(userId: string, type: string, ref: string) {
  const [row] = await sql`
    select status::text as status, run_at, attempts from ops.job_queue
     where idempotency_key = ${`push:${type}:${userId}:${ref}`}`;
  return row as { status: string; run_at: Date; attempts: number } | undefined;
}

async function device(tok: string) {
  const [row] = await sql`select invalidated_at, failure_count from public.devices where push_token = ${tok}`;
  return row as { invalidated_at: Date | null; failure_count: number } | undefined;
}

// ---------------------------------------------------------------- suite
suite('push pipeline (functions + db + stub Expo)', () => {
  beforeAll(async () => {
    startStub();
    await makeUser('prefs', token('prefs'));
    await makeUser('quiet', token('quiet'));
    await makeUser('idem', token('idem'));
    await makeUser('dead', token('Unregistered'));
    await makeUser('later', token('GoneLater'));
  });

  afterAll(async () => {
    const ids = Object.values(users);
    if (ids.length) {
      await sql`delete from ops.job_queue where payload->>'user_id' in ${sql(ids)}`;
      await sql`delete from auth.users where id in ${sql(ids)}`;
    }
    await sql.close();
    stub?.stop(true);
  });

  test('rejects callers without the service role', async () => {
    const res = await fetch(`${FUNCTIONS_URL}/push-dispatch`, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-the-key' },
    });
    expect(res.status).toBe(401);
  });

  test('sends only enabled types, with copy from the shared module', async () => {
    const u = users.prefs;
    await notify(u, 'like', 'like-1', { actor_name: 'Sam' }); // like defaults OFF
    await notify(u, 'comment', 'comment-1', { actor_name: 'Sam', snippet: 'Lovely' });
    await call('push-dispatch');

    const msgs = sentTo(token('prefs'));
    expect(msgs.length).toBe(1);
    const expected = notificationCopy('comment', { actor_name: 'Sam', snippet: 'Lovely' });
    expect(msgs[0].title).toBe(expected.title);
    expect(msgs[0].body).toBe(expected.body);
    expect((await jobFor(u, 'like', 'like-1'))?.status).toBe('done'); // settled, not retried

    // Turning likes on makes the next one go out.
    await sql`insert into public.notification_prefs (user_id, type, enabled) values (${u}, 'like', true)`;
    await notify(u, 'like', 'like-2', { actor_name: 'Sam' });
    await call('push-dispatch');
    expect(sentTo(token('prefs')).length).toBe(2);
    expect(sentTo(token('prefs'))[1].body).toBe(notificationCopy('like', { actor_name: 'Sam' }).body);
  });

  test('defers inside quiet hours instead of sending or dropping', async () => {
    const u = users.quiet;
    // A two-hour quiet window centred on "now" (UTC user).
    await sql`
      update public.users
         set quiet_start = ((now() at time zone 'UTC') - interval '1 hour')::time,
             quiet_end   = ((now() at time zone 'UTC') + interval '1 hour')::time
       where id = ${u}`;
    await notify(u, 'moment_prompt', 'prompt-1');
    await call('push-dispatch');

    expect(sentTo(token('quiet')).length).toBe(0);
    const job = await jobFor(u, 'moment_prompt', 'prompt-1');
    expect(job?.status).toBe('queued');
    expect(job?.attempts).toBe(0);
    const minutesAway = (new Date(job!.run_at).getTime() - Date.now()) / 60000;
    expect(minutesAway).toBeGreaterThan(55);
    expect(minutesAway).toBeLessThan(65);
  });

  test('is idempotent: notifying twice and dispatching twice sends once', async () => {
    const u = users.idem;
    await notify(u, 'friend_request', 'req-1', { actor_name: 'Ada' });
    await notify(u, 'friend_request', 'req-1', { actor_name: 'Ada' });
    await call('push-dispatch');
    await call('push-dispatch');
    expect(sentTo(token('idem')).length).toBe(1);
  });

  test('a DeviceNotRegistered ticket invalidates the token at once', async () => {
    await notify(users.dead, 'comment', 'c-dead');
    await call('push-dispatch');
    expect(sentTo(token('Unregistered')).length).toBe(1);
    const d = await device(token('Unregistered'));
    expect(d?.invalidated_at).not.toBeNull();
  });

  test('a DeviceNotRegistered receipt invalidates the token and counts a failure', async () => {
    await notify(users.later, 'comment', 'c-later');
    await call('push-dispatch');
    expect(sentTo(token('GoneLater')).length).toBe(1);
    expect((await device(token('GoneLater')))?.invalidated_at).toBeNull(); // ticket was ok

    await call('push-receipts', { min_age_seconds: 0 });
    const d = await device(token('GoneLater'));
    expect(d?.invalidated_at).not.toBeNull();
    expect(d?.failure_count).toBe(1);
  });

  test('invalidated tokens get no more pushes, and cleanup prunes them', async () => {
    await notify(users.dead, 'comment', 'c-dead-2');
    await call('push-dispatch');
    expect(sentTo(token('Unregistered')).length).toBe(1); // still just the first one

    await call('token-cleanup');
    expect(await device(token('Unregistered'))).toBeUndefined();
    expect(await device(token('GoneLater'))).toBeUndefined();
    expect(await device(token('prefs'))).toBeDefined();
  });

  test('every run is logged with timing and outcome', async () => {
    const rows = await sql`
      select job_name, outcome::text as outcome, duration_ms from ops.job_runs
       where job_name in ('push-dispatch', 'push-receipts', 'token-cleanup')
         and started_at > now() - interval '5 minutes'`;
    const names = new Set(rows.map((r: { job_name: string }) => r.job_name));
    expect([...names].sort()).toEqual(['push-dispatch', 'push-receipts', 'token-cleanup']);
    expect(rows.every((r: { outcome: string }) => r.outcome === 'ok')).toBe(true);
  });
});
