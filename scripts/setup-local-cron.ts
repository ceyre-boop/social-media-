/// <reference types="node" />
/**
 * LOCAL ONLY — let pg_cron call the local Edge Functions.
 *
 *   bun scripts/setup-local-cron.ts
 *
 * Writes two Vault secrets in the local database, read at call time by ops.invoke_function:
 *   project_url       http://host.docker.internal:54321 (the API as seen from the db container)
 *   service_role_key  the local service-role key, read from `bunx supabase status -o env`
 * Nothing is stored in the repo. Re-run after `bunx supabase db reset`. Without it, cron runs are
 * logged in ops.job_runs as 'skipped'. Hosted projects set the same two secrets in the dashboard.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function fail(msg: string): never {
  console.error(`setup-local-cron: ${msg}`);
  process.exit(1);
}

const status = spawnSync('bunx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' });
if (status.status !== 0) fail('local Supabase is not running');
const env: Record<string, string> = {};
for (const line of status.stdout.split('\n')) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const api = new URL(env.API_URL ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(api.hostname)) fail(`refusing non-local API_URL ${env.API_URL}`);
if (!env.SERVICE_ROLE_KEY) fail('no SERVICE_ROLE_KEY in supabase status');

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync('supabase/config.toml', 'utf8'))?.[1];
if (!projectId) fail('no project_id in supabase/config.toml');

const url = `http://host.docker.internal:${api.port || '54321'}`;
// Values travel as psql variables (stdin script), never interpolated into a shell command.
const script = `
select set_config('setup.url', :'url', false), set_config('setup.key', :'key', false);
do $$
declare n text; v text;
begin
  foreach n in array array['project_url', 'service_role_key'] loop
    v := case n when 'project_url' then current_setting('setup.url') else current_setting('setup.key') end;
    if exists (select 1 from vault.secrets where name = n) then
      perform vault.update_secret((select id from vault.secrets where name = n), v);
    else
      perform vault.create_secret(v, n);
    end if;
  end loop;
end $$;
`;
const res = spawnSync(
  'docker',
  ['exec', '-i', `supabase_db_${projectId}`, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
    '-v', `url=${url}`, '-v', `key=${env.SERVICE_ROLE_KEY}`, '-q'],
  { input: script, encoding: 'utf8' },
);
if (res.status !== 0) fail(res.stderr || 'psql failed');
console.log(`setup-local-cron: vault secrets set (project_url=${url}); cron now calls local functions.`);
