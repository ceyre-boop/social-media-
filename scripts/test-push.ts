/// <reference types="node" />
/**
 * LOCAL ONLY — push pipeline integration test.
 *
 *   bun run test:push
 *
 * 1. Refuses to run unless the local Supabase stack answers on localhost.
 * 2. Starts `supabase functions serve --env-file supabase/functions/.env.test`, which points the
 *    push functions at a stub Expo Push API (host port 54399) instead of exp.host.
 * 3. Runs supabase/functions/tests/*.test.ts with PUSH_ITEST=1 and the local service-role key
 *    (read at runtime from `bunx supabase status -o env`, never stored).
 * 4. Stops the functions server. Exit code = the test's.
 */
import { spawn, spawnSync } from 'node:child_process';

function fail(msg: string): never {
  console.error(`test-push: ${msg}`);
  process.exit(1);
}

const status = spawnSync('bunx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' });
if (status.status !== 0) fail('local Supabase is not running (bunx supabase start)');
const env: Record<string, string> = {};
for (const line of status.stdout.split('\n')) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const api = new URL(env.API_URL ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(api.hostname)) fail(`refusing non-local API_URL ${env.API_URL}`);
if (!env.SERVICE_ROLE_KEY || !env.DB_URL) fail('could not read SERVICE_ROLE_KEY / DB_URL from supabase status');

const functionsUrl = `${env.API_URL}/functions/v1`;
const serve = spawn('bunx', ['supabase', 'functions', 'serve', '--env-file', 'supabase/functions/.env.test'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serveLog = '';
serve.stdout?.on('data', (d) => (serveLog += d));
serve.stderr?.on('data', (d) => (serveLog += d));

async function waitReady() {
  for (let i = 0; i < 90; i++) {
    try {
      // A request with a wrong key reaching our function answers 401 from the function itself.
      const res = await fetch(`${functionsUrl}/token-cleanup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.ANON_KEY}` },
      });
      const text = await res.text();
      if (res.status === 401 && text.includes('unauthorized')) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  serve.kill();
  fail(`functions did not come up:\n${serveLog.slice(-2000)}`);
}

await waitReady();
const test = spawnSync('bun', ['test', 'supabase/functions/tests'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PUSH_ITEST: '1',
    SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    DB_URL: env.DB_URL,
    FUNCTIONS_URL: functionsUrl,
  },
});
serve.kill();
if (test.status !== 0) console.error(serveLog.slice(-3000));
process.exit(test.status ?? 1);
