import { describe, expect, test } from 'bun:test';

import { copy, senderMessage, TIER_ACTION, YELLOW_PROMPT } from './copy.ts';
import { fallbackEmbed } from './fallbackEmbed.ts';
import { SENTIMENT_CORPUS } from './fixtures/sentimentCorpus.ts';
import { evaluate, NEW_ACCOUNT_HOLD_DAYS, type StageBDeps } from './pipeline.ts';
import examplesDoc from './rules/examples.json' with { type: 'json' };
import { buildIndex, type LabelledExample, STAGE_B_CONFIG } from './stageB.ts';
import type { ChatStrictness, EvalContext, Tier } from './types.ts';

const examples = examplesDoc.examples as LabelledExample[];
const fallbackB: StageBDeps = {
  embed: async (t) => fallbackEmbed(t),
  index: buildIndex(examples, (e) => fallbackEmbed(e.text)),
  config: STAGE_B_CONFIG['fallback-hashed-ngrams'],
};

/** One text per raw tier, decided by stage A so the matrix is independent of stage B. */
const RAW: Record<Tier, string> = {
  GREEN: 'great stream tonight',
  YELLOW: 'you’re an idiot',
  ORANGE: 'lets all go after @jess',
  RED: 'kys',
};
const MILD = 'he is such an idiot'; // GREEN, but a Protected room promotes it

const STRICTNESS: ChatStrictness[] = ['open', 'standard', 'protected'];

describe('creator strictness × Trusted Circle matrix (live chat)', () => {
  for (const strictness of STRICTNESS) {
    for (const trusted of [false, true]) {
      const ctx: EvalContext = { surface: 'live_chat', strictness, senderTrusted: trusted };
      const label = `${strictness}${trusted ? ' + trusted' : ''}`;

      test(`${label}: ORANGE and RED are always enforced`, async () => {
        expect((await evaluate(RAW.ORANGE, ctx)).tier).toBe('ORANGE');
        expect((await evaluate(RAW.RED, ctx)).tier).toBe('RED');
      });

      test(`${label}: YELLOW is suppressed only by Open or Trusted`, async () => {
        const v = await evaluate(RAW.YELLOW, ctx);
        expect(v.rawTier).toBe('YELLOW');
        expect(v.tier).toBe(strictness === 'open' || trusted ? 'GREEN' : 'YELLOW');
      });

      test(`${label}: GREEN stays GREEN`, async () => {
        expect((await evaluate(RAW.GREEN, ctx)).tier).toBe('GREEN');
      });

      test(`${label}: a mild insult about a person is YELLOW only in Protected (and Trusted bypasses it)`, async () => {
        const v = await evaluate(MILD, ctx);
        expect(v.tier).toBe(strictness === 'protected' && !trusted ? 'YELLOW' : 'GREEN');
        if (v.tier === 'YELLOW') expect(v.reasons.map((r) => r.code)).toContain('mild_insult');
      });
    }
  }

  test('strictness and trust only apply to live chat', async () => {
    const dm: EvalContext = { surface: 'dm', strictness: 'open', senderTrusted: true };
    expect((await evaluate(RAW.YELLOW, dm)).tier).toBe('YELLOW');
    expect((await evaluate(MILD, { surface: 'comment', strictness: 'protected' })).tier).toBe('GREEN');
  });

  test('Protected holds new accounts briefly (flag only); other levels never hold', async () => {
    const young = NEW_ACCOUNT_HOLD_DAYS - 1;
    expect((await evaluate(RAW.GREEN, { surface: 'live_chat', strictness: 'protected', senderAccountAgeDays: young })).hold).toBe(true);
    expect((await evaluate(RAW.GREEN, { surface: 'live_chat', strictness: 'protected', senderAccountAgeDays: 400 })).hold).toBe(false);
    expect((await evaluate(RAW.GREEN, { surface: 'live_chat', strictness: 'standard', senderAccountAgeDays: 0 })).hold).toBe(false);
  });
});

describe('behaviour contract', () => {
  test('each tier maps to one action and sender copy', async () => {
    const expected: Record<Tier, string | null> = {
      GREEN: null,
      YELLOW: YELLOW_PROMPT,
      ORANGE: copy.orange.body('asks other people to go after a specific person'),
      RED: copy.red.body('tells someone to hurt or kill themselves'),
    };
    for (const tier of ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const) {
      const v = await evaluate(RAW[tier], { surface: 'live_chat' });
      expect(v.tier).toBe(tier);
      expect(v.action).toBe(TIER_ACTION[tier]);
      expect(senderMessage(v)).toBe(expected[tier]);
    }
  });

  test('no copy ever says "guidelines"', async () => {
    for (const text of [...Object.values(RAW), 'send nudes', 'I know where you live', '@jess lives at 12 Oak Street']) {
      const m = senderMessage(await evaluate(text, { surface: 'live_chat' })) ?? '';
      expect(m.toLowerCase()).not.toContain('guideline');
      for (const r of (await evaluate(text, { surface: 'live_chat' })).reasons) {
        expect(r.plainMessage.toLowerCase()).not.toContain('guideline');
      }
    }
  });
});

describe('stage B wiring', () => {
  const axis = (i: number) => {
    const v = new Float32Array(4);
    v[i] = 1;
    return v;
  };
  const toyExamples: LabelledExample[] = [
    { id: 'y1', text: 'y1', tier: 'YELLOW', policy_ref: 'yellow.mockery' },
    { id: 'y2', text: 'y2', tier: 'YELLOW', policy_ref: 'yellow.mockery' },
    { id: 'y3', text: 'y3', tier: 'YELLOW', policy_ref: 'yellow.mockery' },
    { id: 'g1', text: 'g1', tier: 'GREEN', policy_ref: 'green.everyday' },
  ];
  const toy = (vec: Float32Array, calls: string[] = []): StageBDeps => ({
    embed: async (t) => {
      calls.push(t);
      return vec;
    },
    index: buildIndex(toyExamples, (e) => (e.tier === 'YELLOW' ? axis(1) : axis(0))),
    config: { k: 3, minSimilarity: 0.9, minShare: 0.6, redSimilarity: 0.99 },
  });

  test('stage B escalates a targeted message stage A missed, naming the policy section', async () => {
    const v = await evaluate('your nose looks like a potato', { surface: 'comment' }, toy(axis(1)));
    expect(v.rawTier).toBe('YELLOW');
    const b = v.reasons.find((r) => r.stage === 'B')!;
    expect(b.code).toBe('similar_example');
    expect(b.policyRef).toBe('yellow.mockery');
    expect(b.plainMessage).toBe('It reads like mocking how someone looks, sounds, or moves.');
  });

  test('stage B never runs without a target (no embedding call at all)', async () => {
    const calls: string[] = [];
    const v = await evaluate('everything is falling apart and I hate it', { surface: 'comment' }, toy(axis(1), calls));
    expect(v.tier).toBe('GREEN');
    expect(calls).toEqual([]);
    expect(v.timings.stageBSkipped).toBe('no_target');
  });

  test('stage B is skipped when stage A already decided ORANGE or RED', async () => {
    const calls: string[] = [];
    const v = await evaluate(RAW.RED, { surface: 'comment' }, toy(axis(1), calls));
    expect(calls).toEqual([]);
    expect(v.timings.stageBSkipped).toBe('decided_by_stage_a');
  });

  test('stage B never lowers stage A', async () => {
    const v = await evaluate(RAW.YELLOW, { surface: 'comment' }, toy(axis(0)));
    expect(v.tier).toBe('YELLOW');
  });

  test('an embedder failure keeps the stage A verdict (and says so)', async () => {
    const broken: StageBDeps = { ...toy(axis(1)), embed: async () => { throw new Error('model down'); } };
    const v = await evaluate(RAW.YELLOW, { surface: 'comment' }, broken);
    expect(v.tier).toBe('YELLOW');
    expect(v.timings.stageBSkipped).toBe('no_embedder');
  });
});

describe('the never-sentiment corpus through the full pipeline (fallback embedder)', () => {
  test(`all ${SENTIMENT_CORPUS.length} texts are GREEN under every strictness and surface`, async () => {
    const wrong: string[] = [];
    for (const text of SENTIMENT_CORPUS) {
      for (const ctx of [
        ...STRICTNESS.map((s): EvalContext => ({ surface: 'live_chat', strictness: s })),
        { surface: 'dm', recipientIsMinor: true } as EvalContext,
        { surface: 'comment' } as EvalContext,
      ]) {
        const v = await evaluate(text, ctx, fallbackB);
        if (v.tier !== 'GREEN' || v.rawTier !== 'GREEN') {
          wrong.push(`${text} [${ctx.surface}/${ctx.strictness ?? '-'}] => ${v.rawTier}/${v.tier} ${v.reasons.map((r) => `${r.code}:${r.policyRef}`)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
