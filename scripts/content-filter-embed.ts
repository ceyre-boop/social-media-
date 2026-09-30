/**
 * Precomputes gte-small vectors for rules/examples.json into rules/examples.embeddings.json,
 * using the SAME model the production pipeline uses: the `content-filter` Edge Function's
 * service-role `embed` mode. Inputs are normalized exactly as the pipeline normalizes a message
 * (normalize(text).plain).
 *
 *   bunx supabase functions serve content-filter      # in another terminal
 *   SERVICE_ROLE_KEY=... bun scripts/content-filter-embed.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalize } from '../src/lib/contentFilter/normalize.ts';
import { encodeVector, examplesFingerprint, type LabelledExample } from '../src/lib/contentFilter/stageB.ts';

const FUNCTIONS_URL = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1';
const KEY = process.env.SERVICE_ROLE_KEY;
if (!KEY) throw new Error('SERVICE_ROLE_KEY is required (bunx supabase status)');

const rules = (p: string) => fileURLToPath(new URL(`../src/lib/contentFilter/rules/${p}`, import.meta.url));
const examples = (JSON.parse(readFileSync(rules('examples.json'), 'utf8')) as { examples: LabelledExample[] }).examples;

const vectors: Record<string, string> = {};
const BATCH = 25;
let dim = 0;
for (let i = 0; i < examples.length; i += BATCH) {
  const batch = examples.slice(i, i + BATCH);
  const res = await fetch(`${FUNCTIONS_URL}/content-filter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'embed', texts: batch.map((e) => normalize(e.text).plain) }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
  const out = (await res.json()) as { dim: number; vectors: number[][] };
  dim = out.dim;
  batch.forEach((e, j) => (vectors[e.id] = encodeVector(out.vectors[j])));
  console.log(`embedded ${Math.min(i + BATCH, examples.length)}/${examples.length}`);
}

writeFileSync(
  rules('examples.embeddings.json'),
  JSON.stringify({
    model: 'gte-small',
    dim,
    encoding: 'int8-base64',
    input: 'normalized-plain',
    examples_fingerprint: examplesFingerprint(examples),
    vectors,
  }) + '\n',
);
console.log(`wrote ${Object.keys(vectors).length} vectors (dim ${dim})`);
