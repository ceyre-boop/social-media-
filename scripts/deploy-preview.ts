/// <reference types="node" />
/**
 * Publish the public web preview: `bun scripts/deploy-preview.ts`
 *
 * Builds from origin/main in a throwaway git worktree (so uncommitted work never
 * ships), points the build at the hosted preview Supabase project, and deploys the
 * static export to the Vercel project `social-app-preview`.
 *
 * The Vercel project must NOT be connected to GitHub: a git-triggered build has no
 * config and replaces the preview with an empty site (fixed 2026-09-29 with
 * `vercel git disconnect`).
 *
 * Needs: `bunx supabase login` + the repo linked to the preview project, and
 * `vercel login`. The anon key is public by design; the service-role key is never used.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'social-app-preview';
const repo = process.cwd();

function run(cmd: string, args: string[], cwd = repo): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`${cmd} ${args.join(' ')} failed:\n${(r.stderr || r.stdout).trim().split('\n').slice(-12).join('\n')}`);
    process.exit(1);
  }
  // Vercel prints its progress (including the alias) to stderr.
  return `${r.stdout}\n${r.stderr}`;
}

const refFile = join(repo, 'supabase', '.temp', 'project-ref');
if (!existsSync(refFile)) throw new Error('Repo is not linked to a Supabase project (bunx supabase link).');
const ref = readFileSync(refFile, 'utf8').trim();

const keysOut = run('bunx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json']);
const keys = JSON.parse(keysOut.slice(keysOut.indexOf('['))) as { name: string; api_key: string }[];
const anon = keys.find((k) => k.name === 'anon')?.api_key;
if (!anon) throw new Error('Could not read the preview anon key.');

run('git', ['fetch', '-q', 'origin']);
const work = mkdtempSync(join(tmpdir(), 'preview-build-'));
run('git', ['worktree', 'add', '-q', '--detach', work, 'origin/main']);
try {
  console.log(`building origin/main (${run('git', ['rev-parse', '--short', 'HEAD'], work).trim()}) against ${ref}…`);
  run('bun', ['install', '--frozen-lockfile'], work);
  writeFileSync(
    join(work, '.env'),
    `EXPO_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${anon}\nEXPO_PUBLIC_MEDIA_PROVIDER=supabase\n`,
  );
  run('bunx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], work);
  const dist = join(work, 'dist');
  // The Vercel CLI never uploads folders named node_modules, and Expo puts font assets
  // under assets/node_modules/… — ship them as assets/_nm and rewrite the old path.
  const nm = join(dist, 'assets', 'node_modules');
  if (existsSync(nm)) renameSync(nm, join(dist, 'assets', '_nm'));
  writeFileSync(
    join(dist, 'vercel.json'),
    JSON.stringify(
      {
        cleanUrls: true,
        rewrites: [
          { source: '/assets/node_modules/:path*', destination: '/assets/_nm/:path*' },
          { source: '/live/:id', destination: '/live/[id]' },
          { source: '/u/:username', destination: '/u/[username]' },
          { source: '/p/:id/embed', destination: '/p/[id]/embed' },
          { source: '/p/:id', destination: '/p/[id]' },
          { source: '/post/:id', destination: '/post/[id]' },
        ],
        headers: [
          { source: '/_expo/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
        ],
      },
      null,
      2,
    ),
  );
  const out = run('vercel', ['deploy', '--prod', '--yes', '--name', PROJECT], dist);
  const alias = /Aliased\s+(\S+)/.exec(out)?.[1];
  console.log(`deployed: ${alias ?? '(see Vercel dashboard)'}`);
} finally {
  run('git', ['worktree', 'remove', '--force', work]);
  rmSync(work, { recursive: true, force: true });
}
