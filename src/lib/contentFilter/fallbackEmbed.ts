/**
 * FALLBACK EMBEDDER — FOR TESTS AND OFFLINE USE ONLY. Production uses gte-small inside the
 * `content-filter` Edge Function (Supabase.ai.Session('gte-small')).
 *
 * Deterministic hashed bag of n-grams over the folded text: word unigrams, word bigrams, and
 * character trigrams, signed-hashed into 384 dimensions and L2-normalized. Same interface and
 * dimension as gte-small so the pipeline is identical either way. It is lexical, not semantic:
 * accuracy numbers from it are not representative of production.
 */
import { normalize } from './normalize.ts';

export const FALLBACK_DIM = 384;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function add(v: Float32Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const sign = h & 1 ? 1 : -1;
  v[(h >>> 1) % FALLBACK_DIM] += sign * weight;
}

export function fallbackEmbed(text: string): Float32Array {
  const v = new Float32Array(FALLBACK_DIM);
  const words = normalize(text).joined.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    add(v, `w:${w}`, 1);
    if (i + 1 < words.length) add(v, `b:${w} ${words[i + 1]}`, 1);
    const padded = ` ${w} `;
    for (let j = 0; j + 3 <= padded.length; j++) add(v, `c:${padded.slice(j, j + 3)}`, 0.5);
  }
  let norm = 0;
  for (let i = 0; i < FALLBACK_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < FALLBACK_DIM; i++) v[i] /= norm;
  return v;
}
