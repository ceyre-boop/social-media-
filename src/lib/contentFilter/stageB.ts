/**
 * content_filter stage B — embedding nearest-neighbour against the labelled example set
 * (rules/examples.json). Catches semantic variants stage A's rules miss.
 *
 * Contract:
 *   - Stage B only ESCALATES. It never lowers a stage-A tier.
 *   - It runs only when stage A found a target (a person addressed, mentioned, or referred to),
 *     and only when stage A left the tier below ORANGE. See pipeline.ts.
 *   - A RED neighbourhood yields ORANGE, unless all k neighbours are RED at very high similarity
 *     (the "high-confidence B with a policy code" case). Everything else RED comes from stage A.
 *   - Uncertainty resolves GREEN: low similarity or a split vote is GREEN.
 *
 * The production embedder is Supabase's built-in gte-small (384-dim, unit length), run inside the
 * `content-filter` Edge Function. Example vectors are precomputed into
 * rules/examples.embeddings.json by scripts/content-filter-embed.ts.
 */
import { sha256Hex } from './sha256.ts';
import type { PolicyRef, Tier } from './types.ts';

export type LabelledExample = {
  id: string;
  text: string;
  tier: Tier;
  policy_ref: PolicyRef;
  set?: 'sentiment';
};

export type ExampleIndex = {
  ids: string[];
  tiers: Tier[];
  refs: PolicyRef[];
  dim: number;
  vectors: Float32Array; // n * dim, row-major, unit length
};

export type StageBConfig = {
  k: number;
  /** Nearest winning-tier neighbour must be at least this similar to escalate. */
  minSimilarity: number;
  /** Winning tier's share of the similarity-weighted vote. */
  minShare: number;
  /** All k neighbours RED and nearest at least this similar -> RED. */
  redSimilarity: number;
};

export type EmbedderName = 'gte-small' | 'fallback-hashed-ngrams';

/**
 * Thresholds per embedder. gte-small values were chosen on the TRAINING split only
 * (scripts/content-filter-eval.ts); the held-out report is in accuracy.test.ts.
 */
export const STAGE_B_CONFIG: Record<EmbedderName, StageBConfig> = {
  'gte-small': { k: 5, minSimilarity: 0.84, minShare: 0.6, redSimilarity: 0.95 },
  'fallback-hashed-ngrams': { k: 5, minSimilarity: 0.55, minShare: 0.6, redSimilarity: 0.9 },
};

export type Neighbour = { id: string; tier: Tier; policyRef: PolicyRef; similarity: number };

export type StageBResult = {
  tier: Tier;
  policyRef: PolicyRef | null;
  /** Winning tier's share of the weighted vote, 0..1. */
  confidence: number;
  topSimilarity: number;
  neighbours: Neighbour[];
};

export function buildIndex(
  examples: readonly LabelledExample[],
  vectorOf: (e: LabelledExample) => ArrayLike<number>,
): ExampleIndex {
  const first = examples.length ? vectorOf(examples[0]) : [];
  const dim = first.length;
  const vectors = new Float32Array(examples.length * dim);
  const ids: string[] = [];
  const tiers: Tier[] = [];
  const refs: PolicyRef[] = [];
  examples.forEach((e, row) => {
    const v = row === 0 ? first : vectorOf(e);
    if (v.length !== dim) throw new Error(`example ${e.id}: dim ${v.length} != ${dim}`);
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vectors[row * dim + i] = v[i] / norm;
    ids.push(e.id);
    tiers.push(e.tier);
    refs.push(e.policy_ref);
  });
  return { ids, tiers, refs, dim, vectors };
}

export function classifyB(
  query: ArrayLike<number>,
  index: ExampleIndex,
  cfg: StageBConfig,
  exclude?: ReadonlySet<string>,
): StageBResult {
  const { dim, vectors } = index;
  let qn = 0;
  for (let i = 0; i < dim; i++) qn += query[i] * query[i];
  qn = Math.sqrt(qn) || 1;

  // Top-k by cosine similarity (insertion into a small sorted list).
  const top: Neighbour[] = [];
  for (let row = 0; row < index.ids.length; row++) {
    if (exclude?.has(index.ids[row])) continue;
    let dot = 0;
    const off = row * dim;
    for (let i = 0; i < dim; i++) dot += query[i] * vectors[off + i];
    const sim = dot / qn;
    if (top.length < cfg.k || sim > top[top.length - 1].similarity) {
      const n: Neighbour = { id: index.ids[row], tier: index.tiers[row], policyRef: index.refs[row], similarity: sim };
      let at = top.length;
      while (at > 0 && top[at - 1].similarity < sim) at--;
      top.splice(at, 0, n);
      if (top.length > cfg.k) top.pop();
    }
  }

  const green: StageBResult = { tier: 'GREEN', policyRef: null, confidence: 0, topSimilarity: top[0]?.similarity ?? 0, neighbours: top };
  if (top.length === 0) return green;

  const weight: Record<Tier, number> = { GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0 };
  let total = 0;
  for (const n of top) {
    const w = Math.max(0, n.similarity);
    weight[n.tier] += w;
    total += w;
  }
  let winner: Tier = 'GREEN';
  for (const t of ['YELLOW', 'ORANGE', 'RED'] as const) if (weight[t] > weight[winner]) winner = t;
  const share = total > 0 ? weight[winner] / total : 0;
  if (winner === 'GREEN') return { ...green, confidence: share };

  const nearest = top.find((n) => n.tier === winner)!;
  if (nearest.similarity < cfg.minSimilarity || share < cfg.minShare) return { ...green, confidence: share };

  let tier: Tier = winner;
  if (winner === 'RED') {
    const allRed = top.length === cfg.k && top.every((n) => n.tier === 'RED');
    tier = allRed && nearest.similarity >= cfg.redSimilarity ? 'RED' : 'ORANGE';
  }
  return { tier, policyRef: nearest.policyRef, confidence: share, topSimilarity: nearest.similarity, neighbours: top };
}

// ------------------------------------------------------------------ vector file encoding

/** int8-quantized unit vector as base64 (x * 127, rounded). ~512 bytes per 384-dim vector. */
export function encodeVector(v: ArrayLike<number>): string {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  let bin = '';
  for (let i = 0; i < v.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((v[i] / norm) * 127)));
    bin += String.fromCharCode(q & 0xff);
  }
  return btoa(bin);
}

export function decodeVector(b64: string, dim: number): Float32Array {
  const bin = atob(b64);
  if (bin.length !== dim) throw new Error(`vector length ${bin.length} != ${dim}`);
  const out = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const b = bin.charCodeAt(i);
    out[i] = (b > 127 ? b - 256 : b) / 127;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) out[i] /= norm;
  return out;
}

/** Changes whenever an example's id or text changes (labels can change without re-embedding). */
export function examplesFingerprint(examples: readonly LabelledExample[]): string {
  return sha256Hex(JSON.stringify(examples.map((e) => [e.id, e.text])));
}

export type EmbeddingsDoc = {
  model: EmbedderName;
  dim: number;
  encoding: 'int8-base64';
  input: 'normalized-plain';
  examples_fingerprint: string;
  vectors: Record<string, string>;
};

/** Builds the production index from the precomputed gte-small vectors. */
export function indexFromEmbeddings(
  examples: readonly LabelledExample[],
  doc: EmbeddingsDoc,
  exclude?: ReadonlySet<string>,
): ExampleIndex {
  const kept: LabelledExample[] = [];
  for (const e of examples) if (!exclude?.has(e.id)) kept.push(e);
  return buildIndex(kept, (e) => {
    const b64 = doc.vectors[e.id];
    if (!b64) throw new Error(`no embedding for example ${e.id}; re-run scripts/content-filter-embed.ts`);
    return decodeVector(b64, doc.dim);
  });
}
