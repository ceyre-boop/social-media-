/**
 * The product name and currency name live only in src/config/brand.ts. Fails (exit 1) if either
 * appears anywhere else in src/ or app.config.ts. src/lib/db/types.ts mirrors the database and
 * is excluded.
 *
 *   bun scripts/check-brand.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');
const excluded = new Set([
  join(srcDir, 'lib', 'db', 'types.ts'),
  join(srcDir, 'config', 'brand.ts'),
]);
const banned = /smiley|blip/i;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const hits: string[] = [];
for (const file of [...walk(srcDir), join(root, 'app.config.ts')]) {
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
  console.error('Brand names must live in src/config/brand.ts only:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('check-brand: ok');
