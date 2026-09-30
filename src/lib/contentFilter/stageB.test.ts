import { describe, expect, test } from 'bun:test';

import { fallbackEmbed } from './fallbackEmbed.ts';
import embeddingsDoc from './rules/examples.embeddings.json' with { type: 'json' };
import examplesDoc from './rules/examples.json' with { type: 'json' };
import {
  buildIndex,
  classifyB,
  decodeVector,
  encodeVector,
  examplesFingerprint,
  type LabelledExample,
  STAGE_B_CONFIG,
} from './stageB.ts';
import type { Grade } from './types.ts';

const examples = examplesDoc.examples as LabelledExample[];

function unit(v: number[]): number[] {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

describe('vector encoding', () => {
  test('int8 base64 round-trips a unit vector with cosine > 0.999', () => {
    const v = unit(Array.from({ length: 384 }, (_, i) => Math.sin(i * 1.7) + Math.cos(i * 0.3)));
    const back = decodeVector(encodeVector(v), 384);
    let dot = 0;
    for (let i = 0; i < 384; i++) dot += v[i] * back[i];
    expect(dot).toBeGreaterThan(0.999);
  });
});

describe('fallback embedder (tests only — gte-small is the production embedder)', () => {
  test('deterministic, 384-dim, unit length', () => {
    const a = fallbackEmbed('you are an idiot');
    const b = fallbackEmbed('you are an idiot');
    expect(a.length).toBe(384);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Math.hypot(...a)).toBeCloseTo(1, 5);
  });

  test('similar texts are closer than unrelated ones', () => {
    const dot = (x: ArrayLike<number>, y: ArrayLike<number>) => {
      let s = 0;
      for (let i = 0; i < x.length; i++) s += x[i] * y[i];
      return s;
    };
    const q = fallbackEmbed('you are such an idiot');
    expect(dot(q, fallbackEmbed("you're an idiot"))).toBeGreaterThan(dot(q, fallbackEmbed('what song is this?')));
  });
});

describe('classifyB — k-NN semantics on a synthetic index', () => {
  // Axis-aligned toy vectors: dimension 0 = family, 1 = open, 2 = orange, 3 = red.
  const ex = (id: string, grade: Grade, axis: number, jitter: number): LabelledExample & { v: number[] } => {
    const v = [0, 0, 0, 0];
    v[axis] = 1;
    v[(axis + 1) % 4] = jitter;
    return { id, text: id, grade, policy_ref: grade === 'family' ? 'family.everyday' : grade === 'open' ? 'open.roast' : grade === 'orange' ? 'orange.harassing' : 'red.threat', v: unit(v) };
  };
  const toy = [
    ex('g1', 'family', 0, 0.1), ex('g2', 'family', 0, 0.2), ex('g3', 'family', 0, 0.05),
    ex('y1', 'open', 1, 0.1), ex('y2', 'open', 1, 0.2), ex('y3', 'open', 1, 0.05),
    ex('o1', 'orange', 2, 0.1), ex('o2', 'orange', 2, 0.2), ex('o3', 'orange', 2, 0.05),
    ex('r1', 'red', 3, 0.1), ex('r2', 'red', 3, 0.2), ex('r3', 'red', 3, 0.05),
  ];
  const index = buildIndex(toy, (e) => (e as (typeof toy)[number]).v);
  const cfg = { k: 3, minSimilarity: 0.9, minShare: 0.6, redSimilarity: 0.97 };

  test('near open examples -> open with the neighbour policy ref', () => {
    const r = classifyB(unit([0, 1, 0.1, 0]), index, cfg);
    expect(r.grade).toBe('open');
    expect(r.policyRef).toBe('open.roast');
  });

  test('near family examples -> family', () => {
    expect(classifyB(unit([1, 0.1, 0, 0]), index, cfg).grade).toBe('family');
  });

  test('far from everything -> family (uncertainty never escalates)', () => {
    expect(classifyB(unit([1, 1, 1, 1]), index, cfg).grade).toBe('family');
  });

  test('red neighbours give orange unless every neighbour is red at very high similarity', () => {
    expect(classifyB(unit([0, 0, 0, 1]), index, cfg).grade).toBe('red');
    expect(classifyB(unit([0, 0, 0.35, 1]), index, { ...cfg, redSimilarity: 0.999 }).grade).toBe('orange');
  });

  test('exclude drops an example from the neighbour set (leave-one-out)', () => {
    const r = classifyB(unit([0, 1, 0.1, 0]), index, cfg, new Set(['y1', 'y2', 'y3']));
    expect(r.neighbours.some((n) => n.id.startsWith('y'))).toBe(false);
  });
});

describe('rules/examples.json', () => {
  test('policy refs agree with grades, ids are unique, sentiment set is Family (Standard only for a swear) and >= 40', () => {
    const ids = new Set<string>();
    let sentiment = 0;
    for (const e of examples) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.policy_ref.split('.')[0]).toBe(e.grade);
      if (e.set === 'sentiment') {
        sentiment++;
        expect(['family.own_feelings', 'standard.profanity']).toContain(e.policy_ref);
      }
    }
    expect(examples.length).toBeGreaterThanOrEqual(150);
    expect(examples.length).toBeLessThanOrEqual(350);
    expect(sentiment).toBeGreaterThanOrEqual(40);
  });

  test('examples.embeddings.json is fresh (re-run scripts/content-filter-embed.ts if this fails)', () => {
    expect(embeddingsDoc.model).toBe('gte-small');
    expect(embeddingsDoc.dim).toBe(384);
    expect(embeddingsDoc.examples_fingerprint).toBe(examplesFingerprint(examples));
    for (const e of examples) expect(typeof (embeddingsDoc.vectors as Record<string, string>)[e.id]).toBe('string');
  });

  test('configs exist for both embedders', () => {
    expect(STAGE_B_CONFIG['gte-small'].k).toBeGreaterThan(0);
    expect(STAGE_B_CONFIG['fallback-hashed-ngrams'].k).toBeGreaterThan(0);
  });
});
