/**
 * Accuracy report on the labelled example set with the REAL gte-small vectors
 * (rules/examples.embeddings.json). Deterministic split: ~20% of examples (by id hash) are
 * held out; the k-NN index is built from the rest. Thresholds (STAGE_B_CONFIG['gte-small'])
 * are chosen on the training split (leave-one-out grid printed below) — never on held-out.
 *
 * Labels are grades (v0.2 speech dial): family / standard / open / max, then orange / red.
 * The full pipeline is run with room = Max and relationship = friends, so the grade reported is
 * the CONTENT grade (no room or stranger escalation).
 *
 * Asserted (policy lines that must never be crossed):
 *   - zero Family examples graded red
 *   - zero never-sentiment examples given a ceiling, or graded above Standard; profanity-free
 *     sentiment is exactly Family
 * Printed (measured, not asserted): per-grade precision / recall for stage B alone and for the
 * full pipeline, and the level-assignment confusion table.
 */
import { describe, expect, test } from 'bun:test';

import { normalize } from './normalize.ts';
import { evaluate, type StageBDeps } from './pipeline.ts';
import { hasProfanity } from './profanity.ts';
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
import { type EvalContext, type Grade, GRADE_RANK, GRADES, SPEECH_LEVELS } from './types.ts';

const examples = examplesDoc.examples as LabelledExample[];
const doc = embeddingsDoc as unknown as EmbeddingsDoc;
const isHeldOut = (e: LabelledExample) => parseInt(sha256Hex(e.id).slice(0, 2), 16) % 5 === 0;
const train = examples.filter((e) => !isHeldOut(e));
const heldOut = examples.filter(isHeldOut);
const vec = (id: string) => decodeVector(doc.vectors[id], doc.dim);
const byPlain = new Map(examples.map((e) => [normalize(e.text).plain, vec(e.id)]));
const CONTENT: EvalContext = { surface: 'comment', roomLevel: 'max', relationship: 'friends' };

type Pair = { gold: Grade; pred: Grade; text: string; set?: string };

function report(title: string, pairs: Pair[]): string {
  const lines = [`${title} (n=${pairs.length})`, '  grade      prec   recall  support'];
  for (const g of GRADES) {
    const tp = pairs.filter((p) => p.pred === g && p.gold === g).length;
    const predN = pairs.filter((p) => p.pred === g).length;
    const goldN = pairs.filter((p) => p.gold === g).length;
    const prec = predN ? tp / predN : NaN;
    const rec = goldN ? tp / goldN : NaN;
    lines.push(`  ${g.padEnd(9)} ${prec.toFixed(2).padStart(5)}  ${rec.toFixed(2).padStart(6)}  ${String(goldN).padStart(7)}`);
  }
  const acc = pairs.filter((p) => p.pred === p.gold).length / pairs.length;
  const ceilingOk = pairs.filter((p) => (GRADE_RANK[p.gold] >= 4) === (GRADE_RANK[p.pred] >= 4)).length / pairs.length;
  lines.push(`  exact-grade accuracy ${acc.toFixed(2)}   ceiling/not-ceiling agreement ${ceilingOk.toFixed(2)}`);
  return lines.join('\n');
}

/** Rows = gold level, columns = predicted grade. Only the four levels as gold. */
function levelTable(pairs: Pair[]): string {
  const head = `  gold \\ pred ${GRADES.map((g) => g.padStart(8)).join('')}   exact`;
  const rows = SPEECH_LEVELS.map((gold) => {
    const mine = pairs.filter((p) => p.gold === gold);
    const cells = GRADES.map((g) => String(mine.filter((p) => p.pred === g).length).padStart(8)).join('');
    const exact = mine.length ? (mine.filter((p) => p.pred === gold).length / mine.length).toFixed(2) : ' n/a';
    return `  ${gold.padEnd(11)} ${cells}   ${exact}`;
  });
  return [head, ...rows].join('\n');
}

function stageBOnly(set: LabelledExample[], indexSet: LabelledExample[], cfg: StageBConfig, loo: boolean): Pair[] {
  const index = indexFromEmbeddings(indexSet, doc);
  return set.map((e) => ({
    gold: e.grade,
    pred: classifyB(vec(e.id), index, cfg, loo ? new Set([e.id]) : undefined).grade,
    text: e.text,
    set: e.set,
  }));
}

describe('accuracy on the labelled set (gte-small vectors)', () => {
  test('training-split leave-one-out grid (for choosing thresholds)', () => {
    const rows: string[] = ['minSim  minShare  acc   family->higher  higher->family'];
    for (const minSimilarity of [0.84, 0.86, 0.88, 0.9]) {
      for (const minShare of [0.5, 0.6, 0.7]) {
        const cfg = { ...STAGE_B_CONFIG['gte-small'], minSimilarity, minShare };
        const pairs = stageBOnly(train, train, cfg, true);
        const acc = pairs.filter((p) => p.pred === p.gold).length / pairs.length;
        const fp = pairs.filter((p) => p.gold === 'family' && p.pred !== 'family').length;
        const fn = pairs.filter((p) => p.gold !== 'family' && p.pred === 'family').length;
        rows.push(`${minSimilarity.toFixed(2)}    ${minShare.toFixed(1)}      ${acc.toFixed(2)}  ${String(fp).padStart(8)}  ${String(fn).padStart(14)}`);
      }
    }
    console.log(`\nstage B LOO grid on TRAINING split (n=${train.length})\n${rows.join('\n')}`);
  });

  test('held-out report: stage B alone, the full pipeline, and level assignment', async () => {
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
      const v = await evaluate(e.text, CONTENT, deps);
      full.push({ gold: e.grade, pred: v.grade, text: e.text, set: e.set });
    }
    const misses = full.filter((p) => p.pred !== p.gold).map((p) => `  ${p.gold} -> ${p.pred}: ${p.text}`);
    console.log(
      `\n${report('HELD-OUT stage B alone', bOnly)}\n\n${report('HELD-OUT full pipeline (A then B)', full)}` +
        `\n\nLEVEL ASSIGNMENT (held-out, full pipeline)\n${levelTable(full)}\n  misses:\n${misses.join('\n')}`,
    );

    for (const pairs of [bOnly, full]) {
      expect(pairs.filter((p) => p.gold === 'family' && p.pred === 'red').map((p) => p.text)).toEqual([]);
    }
    expect(full.filter((p) => p.set === 'sentiment' && GRADE_RANK[p.pred] > GRADE_RANK.standard).map((p) => p.text)).toEqual([]);
  });

  test('level assignment over the WHOLE set, full pipeline (leave-one-out)', async () => {
    const full: Pair[] = [];
    for (const e of examples) {
      const deps: StageBDeps = {
        embed: async () => vec(e.id),
        index: indexFromEmbeddings(examples, doc, new Set([e.id])),
        config: STAGE_B_CONFIG['gte-small'],
      };
      full.push({ gold: e.grade, pred: (await evaluate(e.text, CONTENT, deps)).grade, text: e.text, set: e.set });
    }
    console.log(`\n${report('WHOLE SET full pipeline, LOO', full)}\n\nLEVEL ASSIGNMENT (whole set, LOO)\n${levelTable(full)}`);
    expect(full.filter((p) => p.gold === 'family' && p.pred === 'red').map((p) => p.text)).toEqual([]);
  });

  test('every never-sentiment example: no ceiling, no mirror at any of the 4 levels; Family unless it swears (LOO)', async () => {
    const wrong: string[] = [];
    for (const e of examples.filter((x) => x.set === 'sentiment')) {
      const deps: StageBDeps = {
        embed: async () => vec(e.id),
        index: indexFromEmbeddings(examples, doc, new Set([e.id])),
        config: STAGE_B_CONFIG['gte-small'],
      };
      const swears = hasProfanity(normalize(e.text));
      for (const roomLevel of SPEECH_LEVELS) {
        const v = await evaluate(e.text, { surface: 'live_chat', roomLevel }, deps);
        const expected = swears && roomLevel === 'family' ? 'ORANGE' : 'GREEN';
        if (v.tier !== expected || v.ceiling !== null || v.requiredLevel !== (swears ? 'standard' : 'family')) {
          wrong.push(`${e.text} [${roomLevel}] => ${v.tier} ${v.requiredLevel}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  test('no Family example anywhere in the set is red under leave-one-out', async () => {
    const pairs = stageBOnly(examples.filter((e) => e.grade === 'family'), examples, STAGE_B_CONFIG['gte-small'], true);
    expect(pairs.filter((p) => p.pred === 'red').map((p) => p.text)).toEqual([]);
  });
});
