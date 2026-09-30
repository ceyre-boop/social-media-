/**
 * Accuracy report on the labelled example set with the REAL gte-small vectors
 * (rules/examples.embeddings.json). Deterministic split: ~20% of examples (by id hash) are
 * held out; the k-NN index is built from the rest. Thresholds (STAGE_B_CONFIG['gte-small'])
 * are chosen on the training split (leave-one-out grid printed below) — never on held-out.
 *
 * Asserted (policy lines that must never be crossed):
 *   - zero GREEN examples classified RED
 *   - zero never-sentiment examples classified anything but GREEN
 * Printed (measured, not asserted): per-tier precision / recall for stage B alone and for the
 * full pipeline (A then B).
 */
import { describe, expect, test } from 'bun:test';

import { normalize } from './normalize.ts';
import { evaluate, type StageBDeps } from './pipeline.ts';
import embeddingsDoc from './rules/examples.embeddings.json' with { type: 'json' };
import examplesDoc from './rules/examples.json' with { type: 'json' };
import { sha256Hex } from './sha256.ts';
import {
  classifyB,
  decodeVector,
  type EmbeddingsDoc,
  indexFromEmbeddings,
  type LabelledExample,
  STAGE_B_CONFIG,
  type StageBConfig,
} from './stageB.ts';
import { TIERS, type Tier } from './types.ts';

const examples = examplesDoc.examples as LabelledExample[];
const doc = embeddingsDoc as unknown as EmbeddingsDoc;
const isHeldOut = (e: LabelledExample) => parseInt(sha256Hex(e.id).slice(0, 2), 16) % 5 === 0;
const train = examples.filter((e) => !isHeldOut(e));
const heldOut = examples.filter(isHeldOut);
const vec = (id: string) => decodeVector(doc.vectors[id], doc.dim);
const byPlain = new Map(examples.map((e) => [normalize(e.text).plain, vec(e.id)]));

type Pair = { gold: Tier; pred: Tier; text: string; set?: string };

function report(title: string, pairs: Pair[]): string {
  const lines = [`${title} (n=${pairs.length})`, '  tier     prec   recall  support'];
  for (const t of TIERS) {
    const tp = pairs.filter((p) => p.pred === t && p.gold === t).length;
    const predN = pairs.filter((p) => p.pred === t).length;
    const goldN = pairs.filter((p) => p.gold === t).length;
    const prec = predN ? tp / predN : NaN;
    const rec = goldN ? tp / goldN : NaN;
    lines.push(`  ${t.padEnd(7)} ${prec.toFixed(2).padStart(5)}  ${rec.toFixed(2).padStart(6)}  ${String(goldN).padStart(7)}`);
  }
  const acc = pairs.filter((p) => p.pred === p.gold).length / pairs.length;
  lines.push(`  exact-tier accuracy ${acc.toFixed(2)}`);
  return lines.join('\n');
}

function stageBOnly(set: LabelledExample[], indexSet: LabelledExample[], cfg: StageBConfig, loo: boolean): Pair[] {
  const index = indexFromEmbeddings(indexSet, doc);
  return set.map((e) => ({
    gold: e.tier,
    pred: classifyB(vec(e.id), index, cfg, loo ? new Set([e.id]) : undefined).tier,
    text: e.text,
    set: e.set,
  }));
}

describe('accuracy on the labelled set (gte-small vectors)', () => {
  test('training-split leave-one-out grid (for choosing thresholds)', () => {
    const rows: string[] = ['minSim  minShare  acc   GREEN->non-GREEN  non-GREEN->GREEN'];
    for (const minSimilarity of [0.84, 0.86, 0.88, 0.9]) {
      for (const minShare of [0.5, 0.6, 0.7]) {
        const cfg = { ...STAGE_B_CONFIG['gte-small'], minSimilarity, minShare };
        const pairs = stageBOnly(train, train, cfg, true);
        const acc = pairs.filter((p) => p.pred === p.gold).length / pairs.length;
        const fp = pairs.filter((p) => p.gold === 'GREEN' && p.pred !== 'GREEN').length;
        const fn = pairs.filter((p) => p.gold !== 'GREEN' && p.pred === 'GREEN').length;
        rows.push(`${minSimilarity.toFixed(2)}    ${minShare.toFixed(1)}      ${acc.toFixed(2)}  ${String(fp).padStart(8)}  ${String(fn).padStart(16)}`);
      }
    }
    console.log(`\nstage B LOO grid on TRAINING split (n=${train.length})\n${rows.join('\n')}`);
  });

  test('held-out report: stage B alone and the full pipeline', async () => {
    const cfg = STAGE_B_CONFIG['gte-small'];
    const bOnly = stageBOnly(heldOut, train, cfg, false);

    const deps: StageBDeps = {
      embed: async (plain) => {
        const v = byPlain.get(plain);
        if (!v) throw new Error(`no precomputed vector for: ${plain}`);
        return v;
      },
      index: indexFromEmbeddings(train, doc),
      config: cfg,
    };
    const full: Pair[] = [];
    for (const e of heldOut) {
      const v = await evaluate(e.text, { surface: 'comment' }, deps);
      full.push({ gold: e.tier, pred: v.rawTier, text: e.text, set: e.set });
    }
    const misses = full.filter((p) => p.pred !== p.gold).map((p) => `  ${p.gold} -> ${p.pred}: ${p.text}`);
    console.log(`\n${report('HELD-OUT stage B alone', bOnly)}\n\n${report('HELD-OUT full pipeline (A then B)', full)}\n  misses:\n${misses.join('\n')}`);

    for (const pairs of [bOnly, full]) {
      expect(pairs.filter((p) => p.gold === 'GREEN' && p.pred === 'RED').map((p) => p.text)).toEqual([]);
    }
    expect(full.filter((p) => p.set === 'sentiment' && p.pred !== 'GREEN').map((p) => p.text)).toEqual([]);
  });

  test('every never-sentiment example is GREEN through the full pipeline (leave-one-out)', async () => {
    const wrong: string[] = [];
    for (const e of examples.filter((x) => x.set === 'sentiment')) {
      const deps: StageBDeps = {
        embed: async () => vec(e.id),
        index: indexFromEmbeddings(examples, doc, new Set([e.id])),
        config: STAGE_B_CONFIG['gte-small'],
      };
      for (const strictness of ['open', 'standard', 'protected'] as const) {
        const v = await evaluate(e.text, { surface: 'live_chat', strictness }, deps);
        if (v.tier !== 'GREEN') wrong.push(`${e.text} [${strictness}] => ${v.tier}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('no GREEN example anywhere in the set is RED under leave-one-out', async () => {
    const pairs = stageBOnly(examples.filter((e) => e.tier === 'GREEN'), examples, STAGE_B_CONFIG['gte-small'], true);
    expect(pairs.filter((p) => p.pred === 'RED').map((p) => p.text)).toEqual([]);
  });
});
