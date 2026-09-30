/**
 * Smiley shows no follower or following counts anywhere in the UI. Fails (exit 1) if any of the
 * count identifiers appear in src/. src/lib/db/types.ts mirrors the database and is excluded.
 *
 *   bun scripts/check-no-counts.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');
const excluded = new Set([join(srcDir, 'lib', 'db', 'types.ts')]);
const banned = /follower_count|following_count|followerCount|followingCount/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const hits: string[] = [];
for (const file of walk(srcDir)) {
  if (excluded.has(file)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (banned.test(line)) {
        hits.push(`${relative(root, file).split(sep).join('/')}:${i + 1}: ${line.trim()}`);
      }
    });
}

if (hits.length > 0) {
  console.error('Follower/following counts must not appear in the UI (DESIGN.md, principle 1):');
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log('check:counts ok: no follower/following count identifiers in src/');
