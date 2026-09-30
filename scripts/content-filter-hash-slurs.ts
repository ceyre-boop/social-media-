/**
 * Builds src/lib/contentFilter/rules/slurs.hash.json from a PLAINTEXT list kept OUTSIDE the repo.
 * Each line of the input is one term (or two-word phrase); blank lines and lines starting with #
 * are ignored. Terms are folded exactly as stage A folds messages (normalize.ts foldTerm), then
 * SHA-256 hashed. The test sentinels are always included so the mechanism stays testable.
 *
 *   bun scripts/content-filter-hash-slurs.ts /path/outside/repo/slurs.txt
 *   bun scripts/content-filter-hash-slurs.ts            # sentinels only (placeholder list)
 *
 * The hashes keep the list out of plain sight in the repo and in app bundles. They are NOT a
 * secret: short words hash to a dictionary-reversible value. Review happens on the plaintext.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { foldTerm } from '../src/lib/contentFilter/normalize.ts';
import { sha256Hex } from '../src/lib/contentFilter/sha256.ts';
import { SLUR_TEST_SENTINELS } from '../src/lib/contentFilter/stageA.ts';

const input = process.argv[2];
const terms: string[] = [];
if (input) {
  for (const raw of readFileSync(input, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line && !line.startsWith('#')) terms.push(line);
  }
}
const hashes = [...new Set([...SLUR_TEST_SENTINELS, ...terms].map((t) => sha256Hex(foldTerm(t))))].sort();
const out = fileURLToPath(new URL('../src/lib/contentFilter/rules/slurs.hash.json', import.meta.url));
const doc = {
  algorithm: 'sha256(foldTerm(term)) — see scripts/content-filter-hash-slurs.ts',
  status: terms.length ? 'loaded' : 'placeholder: test sentinels only; real list pending moderation review',
  count: hashes.length,
  hashes,
};
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${hashes.length} hashes (${terms.length} terms + ${SLUR_TEST_SENTINELS.length} sentinels) to ${out}`);
