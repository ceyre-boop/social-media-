/// <reference types="node" />
/**
 * DEV ONLY — seed 20 local reels for the Milestone 2 reel-player perf test.
 *
 *   bun scripts/seed-reels.ts
 *
 * What it does:
 *   1. Refuses to run unless the local Supabase stack (`bunx supabase status`)
 *      answers on localhost / 127.0.0.1. It never touches a hosted project.
 *   2. Generates 20 portrait clips with the local ffmpeg (720x1280, H.264 main,
 *      ~1.5 Mbps, AAC 128k, +faststart, 5–25 s), each a different animated
 *      pattern (gradients / mandelbrot / life / cellauto / testsrc2, hue-shifted)
 *      with a big "REEL N" label and a quiet sine tone, plus a poster JPEG of
 *      the first frame. No network video sources are used.
 *      Output dir: $SEED_REELS_OUT, else <os tmpdir>/seed-reels.
 *      Existing clips are reused, so re-runs are fast.
 *   3. Uploads each clip to `media/<authorId>/reel-N.mp4` and its poster to
 *      `media/<authorId>/reel-N-poster.jpg` with the service-role key, read at
 *      runtime from `bunx supabase status -o env` (never stored in the repo).
 *   4. Inserts media_assets (video, ready, duration/size from ffprobe,
 *      poster_path), a public posts row (kind 'reel', created over the last 3
 *      days) and the post_media link. Fixed ids make it idempotent: a reel whose
 *      post already exists is skipped.
 *
 * Authors: the four adult seed users (alice, bob, carol, dave), five reels
 * each. minnie (15) is deliberately not given public reels.
 *
 * Feed setup (so Home and Discover differ per viewer):
 *   * alice → bob is already 'regular' (seed.sql); this script adds
 *     alice follows carol. alice's Home = her own + bob's + carol's reels;
 *     alice's Discover = dave's reels.
 *   * dave follows bob. dave's Home = his own + bob's reels; dave's Discover =
 *     alice's + carol's reels.
 *   * carol → alice is 'returning' (seed.sql): carol's Home = her own +
 *     alice's reels; her Discover = bob's + dave's.
 *   (There is no seed user "erin"; the five seed users are alice, bob,
 *   minnie, carol, dave.)
 *
 * `bunx supabase db reset` wipes storage metadata and rows; run this again after.
 *
 * Real content: `bun scripts/seed-reels.ts --from ~/path/to/videos`
 *   Uses up to 20 real videos from the folder (mp4/mov/m4v/webm/mkv, sorted by
 *   name) in place of the generated patterns: scaled/cropped to 720x1280, first
 *   30 s, ~1.5 Mbps. Captions come from the file names. Missing slots fall back
 *   to generated clips. Reels already seeded are skipped, so to swap generated
 *   reels for real ones run `bunx supabase db reset` first.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/db/types';

// ---------------------------------------------------------------- constants

const REEL_COUNT = 20;
const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const BUCKET = 'media';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const USERS = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  carol: '44444444-4444-4444-8444-444444444444',
  dave: '55555555-5555-4555-8555-555555555555',
} as const;
type SeedUser = keyof typeof USERS;
const AUTHOR_ORDER: SeedUser[] = ['alice', 'bob', 'carol', 'dave'];

/** Extra follows so Home and Discover differ per viewer (see header). */
const FOLLOWS: { follower: SeedUser; followee: SeedUser }[] = [
  { follower: 'alice', followee: 'carol' },
  { follower: 'dave', followee: 'bob' },
];

const DURATIONS_S = [7, 12, 18, 25, 5, 9, 14, 21, 6, 16, 23, 11, 8, 19, 13, 24, 10, 15, 20, 22];

const CAPTIONS = [
  'Morning light, slowed down.',
  'Five minutes of calm.',
  'Found this pattern and could not stop watching.',
  'For anyone who needs a breather today.',
  'Tiny loops, big mood.',
  'Colors I would wear.',
  'The kind of quiet I like.',
  'Watched it three times. No regrets.',
  'Soft focus Sunday.',
  'Little universe in a box.',
  'Hum along if you want.',
  'Made this while the kettle boiled.',
  'Cellular, but friendly.',
  'Gradient therapy.',
  'Just vibes, no algorithm.',
  'A small good thing.',
  'Pink hour.',
  'Counting sheep, but make it fractal.',
  'Breathe in on the fade.',
  'That is all for today — see you tomorrow.',
];

// Pentatonic-ish, gentle tones (Hz).
const TONES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

// ---------------------------------------------------------------- helpers

function fail(message: string): never {
  console.error(`seed-reels: ${message}`);
  process.exit(1);
}

function run(cmd: string, args: string[], what: string): string {
  const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) fail(`${what}: could not start ${cmd} (${res.error.message})`);
  if (res.status !== 0) {
    const tail = (res.stderr || res.stdout || '').trim().split('\n').slice(-8).join('\n');
    fail(`${what} failed (exit ${res.status}):\n${tail}`);
  }
  return res.stdout;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Deterministic ids, so re-runs find what they already created. */
function mediaId(n: number): string {
  return `5eed0000-0000-4000-8000-0000000000${pad2(n)}`;
}
function postId(n: number): string {
  return `5eed0001-0000-4000-8000-0000000000${pad2(n)}`;
}

// ------------------------------------------------------- local stack + safety

type LocalStack = { apiUrl: string; serviceRoleKey: string };

function readLocalStack(): LocalStack {
  const out = run('bunx', ['supabase', 'status', '-o', 'env'], 'bunx supabase status');
  const env = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env.set(m[1], m[2]);
  }
  const apiUrl = env.get('API_URL');
  const serviceRoleKey = env.get('SERVICE_ROLE_KEY');
  if (!apiUrl || !serviceRoleKey) fail('supabase status did not report API_URL and SERVICE_ROLE_KEY. Is the local stack running?');
  return { apiUrl, serviceRoleKey };
}

function assertLocal(url: string, label: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail(`${label} is not a valid URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host)) fail(`${label} points at ${host}; this dev-only script runs against localhost / 127.0.0.1 only.`);
}

// ------------------------------------------------------------- ffmpeg clips

/** 5x7 pixel font for the "REEL N" label (only the glyphs we need). */
const GLYPHS: Record<string, string[]> = {
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const PX = 14; // one font pixel
const LABEL_PAD = 28;

/**
 * drawbox filters that paint `text` in the pixel font as a MASK: white glyphs on
 * opaque black. (drawbox does not write alpha, so the clip turns the mask into
 * alpha with alphamerge: white text plus a soft offset shadow.)
 */
function labelFilters(text: string): { filters: string; width: number; height: number } {
  const chars = [...text];
  const charW = 5 * PX;
  const gap = PX;
  const textW = chars.length * charW + (chars.length - 1) * gap;
  const width = textW + LABEL_PAD * 2;
  const height = 7 * PX + LABEL_PAD * 2;
  const boxes: string[] = [];
  const cells: { x: number; y: number }[] = [];
  chars.forEach((ch, ci) => {
    const glyph = GLYPHS[ch];
    if (!glyph) fail(`no glyph for "${ch}"`);
    glyph.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === '1') cells.push({ x: LABEL_PAD + ci * (charW + gap) + rx * PX, y: LABEL_PAD + ry * PX });
      });
    });
  });
  for (const c of cells) boxes.push(`drawbox=x=${c.x}:y=${c.y}:w=${PX}:h=${PX}:color=white:t=fill`);
  return { filters: boxes.join(','), width, height };
}

function makeLabel(n: number, file: string): void {
  const { filters, width, height } = labelFilters(`REEL ${n}`);
  run(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height},format=gray`,
     '-vf', filters, '-frames:v', '1', file],
    `label ${n}`,
  );
}

/** The animated background for clip n (varied by pattern and hue). */
function backgroundSource(n: number, seconds: number): string {
  const hue = (n * 47) % 360; // n and n+5 / n+10 land far apart on the wheel
  const tail = `,hue=h=${hue}:s=0.9,vignette=PI/5,format=yuv420p`;
  switch (n % 5) {
    case 0:
      return `gradients=s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${seconds}:c0=0xff7eb3:c1=0x7a2048:c2=0xffd1a8:n=3:speed=0.015:type=radial${tail}`;
    case 1:
      return `mandelbrot=s=360x640:r=${FPS}:maxiter=192:start_scale=2.4:end_scale=0.6:end_pts=${seconds * 1.5}:outer=normalized_iteration_count,scale=${WIDTH}:${HEIGHT}${tail}`;
    case 2:
      return `life=s=180x320:r=15:mold=20:ratio=0.18:life_color=0xffc2e0:death_color=0x2b0a22:mold_color=0x8a2c5f,scale=${WIDTH}:${HEIGHT}:flags=neighbor,fps=${FPS}${tail}`;
    case 3:
      return `cellauto=s=180x320:rule=${[30, 90, 110, 150][n % 4]}:r=${FPS}:scroll=1:full=1,scale=${WIDTH}:${HEIGHT}:flags=neighbor,format=rgb24,colorchannelmixer=rr=1:gg=0.55:bb=0.78${tail}`;
    default:
      return `testsrc2=s=${WIDTH}x${HEIGHT}:r=${FPS}${tail}`;
  }
}

function makeClip(n: number, seconds: number, label: string, file: string): void {
  const tone = TONES[n % TONES.length];
  const fadeOut = Math.max(seconds - 0.8, 0.1).toFixed(2);
  const { width: lw, height: lh } = labelFilters(`REEL ${n}`);
  const at = (dx: number) => `x=(W-w)/2+${dx}:y=H*0.62+${dx}`;
  run(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', backgroundSource(n, seconds),
      '-loop', '1', '-i', label,
      '-f', 'lavfi', '-i', `sine=f=${tone}:sample_rate=44100`,
      '-filter_complex',
      `[1:v]format=gray,split=2[m1][m2];` +
        `color=c=white:s=${lw}x${lh}:r=${FPS}[white];[white][m1]alphamerge[txt];` +
        `color=c=black:s=${lw}x${lh}:r=${FPS}[black];[black][m2]alphamerge,colorchannelmixer=aa=0.45[shadow];` +
        `color=c=black:s=${lw}x${lh}:r=${FPS},format=rgba,colorchannelmixer=aa=0.22[pill];` +
        `[0:v][pill]overlay=${at(0)}:shortest=1[v1];[v1][shadow]overlay=${at(5)}:shortest=1[v2];` +
        `[v2][txt]overlay=${at(0)}:shortest=1,format=yuv420p[v];` +
        `[2:a]volume=0.08,afade=t=in:d=0.6,afade=t=out:st=${fadeOut}:d=0.8[a]`,
      '-map', '[v]', '-map', '[a]',
      '-t', String(seconds),
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3000k', '-g', String(FPS * 2),
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart',
      file,
    ],
    `clip ${n}`,
  );
}

function makePoster(clip: string, file: string): void {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', clip, '-frames:v', '1', '-q:v', '3', file], `poster ${file}`);
}

type Probe = { durationMs: number; width: number; height: number; bytes: number };

function probe(file: string): Probe {
  const out = run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file],
    `ffprobe ${file}`,
  );
  const parsed = JSON.parse(out) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const width = parsed.streams?.[0]?.width;
  const height = parsed.streams?.[0]?.height;
  const duration = Number(parsed.format?.duration);
  if (!width || !height || !Number.isFinite(duration) || duration <= 0) fail(`ffprobe returned an unexpected shape for ${file}`);
  return { durationMs: Math.round(duration * 1000), width, height, bytes: statSync(file).size };
}

type Clip = Probe & { n: number; clipFile: string; posterFile: string; sha256: string; caption: string };

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

/** Real source videos from `--from <dir>`, sorted by name, at most REEL_COUNT. */
function realSources(fromDir: string | undefined): string[] {
  if (!fromDir) return [];
  if (!existsSync(fromDir)) fail(`--from folder not found: ${fromDir}`);
  const files = readdirSync(fromDir)
    .filter((f) => VIDEO_EXT.test(f) && !f.startsWith('.'))
    .sort()
    .slice(0, REEL_COUNT)
    .map((f) => join(fromDir, f));
  if (files.length === 0) fail(`--from folder has no videos (mp4/mov/m4v/webm/mkv): ${fromDir}`);
  return files;
}

/**
 * Normalise a real clip to the app's upload target: portrait 720x1280 (scale to
 * fill, center-crop), first 30 s at most, H.264 main ~1.5 Mbps, AAC, faststart.
 * Clips without audio get a silent track so every reel has the same shape.
 */
function transcodeReal(src: string, file: string): void {
  run(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-i', src,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', '30',
      '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:a:0',
      '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS}`,
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3000k',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
      file,
    ],
    `transcoding ${basename(src)}`,
  );
}

/** "IMG_0423 beach walk.MOV" → "Beach walk". Falls back to the stock caption. */
function captionFromFile(src: string, fallback: string): string {
  const words = basename(src, extname(src))
    .replace(/^(img|vid|mov|pxl|dsc)[_-]?\d+/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : fallback;
}

function buildClips(outDir: string, fromDir?: string): Clip[] {
  mkdirSync(outDir, { recursive: true });
  const real = realSources(fromDir);
  const clips: Clip[] = [];
  for (let n = 1; n <= REEL_COUNT; n++) {
    const src = real[n - 1];
    if (src) {
      // Cache per source file so re-runs don't re-encode.
      const key = createHash('sha1').update(`${src}:${statSync(src).mtimeMs}`).digest('hex').slice(0, 10);
      const clipFile = join(outDir, `real-${key}.mp4`);
      const posterFile = join(outDir, `real-${key}-poster.jpg`);
      if (!existsSync(clipFile)) {
        process.stdout.write(`  transcoding ${basename(src)} → reel ${n}… `);
        transcodeReal(src, clipFile);
        console.log('ok');
      }
      if (!existsSync(posterFile)) makePoster(clipFile, posterFile);
      const meta = probe(clipFile);
      if (meta.durationMs > 30_000) fail(`reel ${n} (${basename(src)}) is ${meta.durationMs} ms, over the 30 s cap`);
      const sha256 = createHash('sha256').update(readFileSync(clipFile)).digest('hex');
      clips.push({ n, clipFile, posterFile, sha256, caption: captionFromFile(src, CAPTIONS[n - 1]), ...meta });
      continue;
    }
    const clipFile = join(outDir, `reel-${n}.mp4`);
    const posterFile = join(outDir, `reel-${n}-poster.jpg`);
    const labelFile = join(outDir, `label-${n}.png`);
    if (!existsSync(clipFile)) {
      process.stdout.write(`  generating reel ${n} (${DURATIONS_S[n - 1]}s)… `);
      makeLabel(n, labelFile);
      makeClip(n, DURATIONS_S[n - 1], labelFile, clipFile);
      console.log('ok');
    }
    if (!existsSync(posterFile)) makePoster(clipFile, posterFile);
    const meta = probe(clipFile);
    if (meta.durationMs > 30_000) fail(`reel ${n} is ${meta.durationMs} ms, over the 30 s cap`);
    const sha256 = createHash('sha256').update(readFileSync(clipFile)).digest('hex');
    clips.push({ n, clipFile, posterFile, sha256, caption: CAPTIONS[n - 1], ...meta });
  }
  return clips;
}

// ----------------------------------------------------------------- database

async function upload(db: SupabaseClient<Database>, path: string, file: string, contentType: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(path, readFileSync(file), { contentType, upsert: true });
  if (error) fail(`upload ${path}: ${error.message}`);
}

async function ensureSeedUsers(db: SupabaseClient<Database>): Promise<void> {
  const ids = Object.values(USERS);
  const { data, error } = await db.from('profiles').select('user_id').in('user_id', ids);
  if (error) fail(`reading seed profiles: ${error.message}`);
  if ((data ?? []).length !== ids.length) fail('seed users are missing — run `bunx supabase db reset` first.');
}

async function ensureFollows(db: SupabaseClient<Database>): Promise<void> {
  const rows = FOLLOWS.map((f) => ({ follower_id: USERS[f.follower], followee_id: USERS[f.followee] }));
  const { error } = await db.from('follows').upsert(rows, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true });
  if (error) fail(`follows: ${error.message}`);
}

async function seedReel(db: SupabaseClient<Database>, clip: Clip, now: number): Promise<'created' | 'skipped'> {
  const pid = postId(clip.n);
  const { data: existing, error: exErr } = await db.from('posts').select('id').eq('id', pid).maybeSingle();
  if (exErr) fail(`checking reel ${clip.n}: ${exErr.message}`);
  if (existing) return 'skipped';

  const author = AUTHOR_ORDER[(clip.n - 1) % AUTHOR_ORDER.length];
  const authorId = USERS[author];
  const videoPath = `${authorId}/reel-${clip.n}.mp4`;
  const posterPath = `${authorId}/reel-${clip.n}-poster.jpg`;
  await upload(db, videoPath, clip.clipFile, 'video/mp4');
  await upload(db, posterPath, clip.posterFile, 'image/jpeg');

  const { error: mErr } = await db.from('media_assets').upsert(
    {
      id: mediaId(clip.n),
      owner_id: authorId,
      kind: 'video',
      status: 'ready',
      provider: 'supabase',
      provider_asset_id: videoPath,
      poster_path: posterPath,
      duration_ms: clip.durationMs,
      width: clip.width,
      height: clip.height,
      bytes: clip.bytes,
      content_hash: clip.sha256,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (mErr) fail(`media_assets for reel ${clip.n}: ${mErr.message}`);

  // Spread over the last ~3 days, newest = reel 1.
  const createdAt = new Date(now - clip.n * 3.4 * 3600 * 1000).toISOString();
  const { error: pErr } = await db.from('posts').insert({
    id: pid,
    author_id: authorId,
    kind: 'reel',
    caption: clip.caption,
    visibility: 'public',
    created_at: createdAt,
  });
  if (pErr) fail(`post for reel ${clip.n}: ${pErr.message}`);

  const { error: pmErr } = await db.from('post_media').insert({ post_id: pid, media_id: mediaId(clip.n), position: 0 });
  if (pmErr) fail(`post_media for reel ${clip.n}: ${pmErr.message}`);
  return 'created';
}

// --------------------------------------------------------------------- main

async function main(): Promise<void> {
  const stack = readLocalStack();
  assertLocal(stack.apiUrl, 'supabase status API_URL');
  const appUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (appUrl) assertLocal(appUrl, 'EXPO_PUBLIC_SUPABASE_URL');

  const outDir = process.env.SEED_REELS_OUT ?? join(tmpdir(), 'seed-reels');
  const fromIdx = process.argv.indexOf('--from');
  const fromDir = fromIdx > -1 ? process.argv[fromIdx + 1] : undefined;
  console.log(`seed-reels: clips in ${outDir}${fromDir ? ` (real videos from ${fromDir})` : ''}`);
  const clips = buildClips(outDir, fromDir);

  const db = createClient<Database>(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await ensureSeedUsers(db);
  await ensureFollows(db);

  const now = Date.now();
  let created = 0;
  let skipped = 0;
  for (const clip of clips) {
    const result = await seedReel(db, clip, now);
    if (result === 'created') created++;
    else skipped++;
  }

  const { count, error } = await db
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'reel')
    .in('id', Array.from({ length: REEL_COUNT }, (_, i) => postId(i + 1)));
  if (error) fail(`counting reels: ${error.message}`);
  console.log(`seed-reels: ${created} created, ${skipped} already present, ${count ?? 0} seeded reels in the database.`);
}

await main();
