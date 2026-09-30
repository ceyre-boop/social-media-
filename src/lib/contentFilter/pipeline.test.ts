import { describe, expect, test } from 'bun:test';

import { copy, senderMessage, TIER_ACTION, YELLOW_PROMPT } from './copy.ts';
import { fallbackEmbed } from './fallbackEmbed.ts';
import { SENTIMENT_CORPUS } from './fixtures/sentimentCorpus.ts';
import { allowedLevels, displayFor, effectiveLevel } from './levels.ts';
import { evaluate, HARASSMENT_PRIOR_THRESHOLD, type StageBDeps } from './pipeline.ts';
import examplesDoc from './rules/examples.json' with { type: 'json' };
import { buildIndex, type LabelledExample, STAGE_B_CONFIG } from './stageB.ts';
import { type EvalContext, type Relationship, SPEECH_LEVELS, type SpeechLevel, type Tier } from './types.ts';

const examples = examplesDoc.examples as LabelledExample[];
const fallbackB: StageBDeps = {
  embed: async (t) => fallbackEmbed(t),
  index: buildIndex(examples, (e) => fallbackEmbed(e.text)),
  config: STAGE_B_CONFIG['fallback-hashed-ngrams'],
};

const at = (roomLevel: SpeechLevel, extra: Partial<EvalContext> = {}): EvalContext => ({ surface: 'comment', roomLevel, ...extra });
const tierOf = async (text: string, ctx: EvalContext) => (await evaluate(text, ctx)).tier;

describe('level assignment (stage A)', () => {
  test.each([
    ['great stream tonight', 'family'],
    ['I’m so sad today', 'family'],
    ['this is awful', 'family'],
    ['I’m furious at the airline', 'family'],
    ['this level is so damn hard', 'standard'],
    ['you’re an idiot', 'standard'],
    ['your aim is trash, you’re such a loser lol', 'open'],
    ['I farted so loud the dog left', 'open'],
    ['dead baby jokes get me through mondays', 'max'],
  ] as const)('%s -> %s', async (text, level) => {
    expect((await evaluate(text, at('max', { relationship: 'friends' }))).requiredLevel).toBe(level);
  });
});

/** One text per rung, decided by stage A. */
const RUNG: Record<SpeechLevel, string> = {
  family: 'great stream tonight',
  standard: 'this is some bullshit weather',
  open: 'I just farted in the middle of the meeting',
  max: 'dead baby jokes are the only thing getting me through',
};

describe('the dial: a message above the room gets a rephrase prompt, never a strike', () => {
  for (const room of SPEECH_LEVELS) {
    for (const rung of SPEECH_LEVELS) {
      const allowed = SPEECH_LEVELS.indexOf(rung) <= SPEECH_LEVELS.indexOf(room);
      test(`${rung} message in a ${room} room -> ${allowed ? 'GREEN' : 'ORANGE rephrase'}`, async () => {
        const v = await evaluate(RUNG[rung], at(room));
        expect(v.tier).toBe(allowed ? 'GREEN' : 'ORANGE');
        expect(v.ceiling).toBeNull();
        if (!allowed) {
          expect(v.reasons.map((r) => r.code)).toContain('above_room_level');
          expect(senderMessage(v)).toStartWith(`This room is set to ${room[0].toUpperCase()}${room.slice(1)}, which keeps out`);
        }
      });
    }
  }

  test('a DM above what the recipient accepts names them, not a room', async () => {
    const v = await evaluate('holy shit', { surface: 'dm', roomLevel: 'family' });
    expect(senderMessage(v)).toBe("They've set their messages to Family, which keeps out swearing. Reword it and it'll go through.");
  });
});

describe('the ceiling is enforced at every level, for every relationship', () => {
  const CEILING: [string, Tier][] = [
    ['kys', 'RED'],
    ['I know where you live', 'RED'],
    ['lets all go after @jess', 'ORANGE'],
    ['nobody likes you', 'ORANGE'],
    ['give me your password', 'ORANGE'],
    ['I made another account since you blocked me', 'ORANGE'],
    ['send nudes', 'ORANGE'],
    ['so horny tonight', 'ORANGE'],
    ['@jess lives at 12 Oak Street', 'ORANGE'],
  ];
  for (const level of SPEECH_LEVELS) {
    for (const rel of ['friends', 'mutual', 'strangers'] as Relationship[]) {
      test(`${level} / ${rel}`, async () => {
        for (const [text, tier] of CEILING) {
          const v = await evaluate(text, at(level, { relationship: rel }));
          expect(`${text}: ${v.tier}`).toBe(`${text}: ${tier}`);
          expect(v.ceiling).toBe(tier as 'ORANGE' | 'RED');
        }
      });
    }
  }

  test('a Trusted Circle member is still stopped by the ceiling', async () => {
    expect(await tierOf('nobody likes you', { surface: 'live_chat', roomLevel: 'max', senderTrusted: true })).toBe('ORANGE');
  });
});

describe('insults: the YELLOW mirror', () => {
  const INSULT = 'you’re an idiot';
  test('Family: rephrase. Standard: mirror, for everyone.', async () => {
    expect(await tierOf(INSULT, at('family', { relationship: 'friends' }))).toBe('ORANGE');
    expect(await tierOf(INSULT, at('standard', { relationship: 'friends' }))).toBe('YELLOW');
    expect(await tierOf(INSULT, at('standard', { relationship: 'strangers' }))).toBe('YELLOW');
  });
  test('Open and Max: friends and mutuals skip the mirror, strangers get it', async () => {
    for (const lvl of ['open', 'max'] as const) {
      expect(await tierOf(INSULT, at(lvl, { relationship: 'friends' }))).toBe('GREEN');
      expect(await tierOf(INSULT, at(lvl, { relationship: 'mutual' }))).toBe('GREEN');
      expect(await tierOf(INSULT, at(lvl, { relationship: 'strangers' }))).toBe('YELLOW');
    }
  });
  test('the host’s Trusted Circle skips the mirror in live chat', async () => {
    expect(await tierOf(INSULT, { surface: 'live_chat', roomLevel: 'standard', senderTrusted: true })).toBe('GREEN');
  });
});

describe('banter vs bullying: intent via relationship', () => {
  const ROASTS = ['you’re such a loser lol', 'your voice is so annoying', 'you look like a potato in that hat'];
  test('a roast between friends / mutuals is fine at Open and Max', async () => {
    for (const t of ROASTS) {
      for (const lvl of ['open', 'max'] as const) {
        for (const rel of ['friends', 'mutual'] as const) {
          expect(`${t} ${lvl} ${rel}: ${await tierOf(t, at(lvl, { relationship: rel }))}`).toBe(`${t} ${lvl} ${rel}: GREEN`);
        }
      }
    }
  });
  test('the same roast is above the room at Family / Standard, even between friends', async () => {
    for (const t of ROASTS) {
      for (const lvl of ['family', 'standard'] as const) {
        const v = await evaluate(t, at(lvl, { relationship: 'friends' }));
        expect(v.tier).toBe('ORANGE');
        expect(v.ceiling).toBeNull();
      }
    }
  });
  test('aimed at a stranger it is bullying, at every level', async () => {
    for (const t of ROASTS) {
      for (const lvl of SPEECH_LEVELS) {
        const v = await evaluate(t, at(lvl, { relationship: 'strangers' }));
        expect(v.tier).toBe('ORANGE');
        expect(v.ceiling).toBe('ORANGE');
        expect(v.reasons[0].code).toBe('bullying_stranger');
      }
    }
  });
  test('a roast about someone not in the conversation is just an Open-level message', async () => {
    const v = await evaluate('that guy is a worthless loser', at('open', { relationship: 'strangers' }));
    expect(v.tier).toBe('GREEN');
    expect(v.requiredLevel).toBe('open');
  });
});

describe('harassing: the per sender→target counter', () => {
  test(`the ${HARASSMENT_PRIOR_THRESHOLD + 1}th hostile message to the same person inside the window is ORANGE`, async () => {
    const ctx = at('max', { relationship: 'strangers' });
    expect((await evaluate('you’re an idiot', { ...ctx, priorTargetedCount: HARASSMENT_PRIOR_THRESHOLD - 1 })).tier).toBe('YELLOW');
    const v = await evaluate('you’re an idiot', { ...ctx, priorTargetedCount: HARASSMENT_PRIOR_THRESHOLD });
    expect(v.tier).toBe('ORANGE');
    expect(v.reasons[0].code).toBe('repeat_targeting');
  });
  test('hostile messages count; friendly banter and kind words do not', async () => {
    expect((await evaluate('you’re an idiot', at('standard'))).hostileTargeted).toBe(true);
    expect((await evaluate('you’re an idiot', at('open', { relationship: 'friends' }))).hostileTargeted).toBe(false);
    expect((await evaluate('you’re amazing', at('standard'))).hostileTargeted).toBe(false);
    expect((await evaluate('you’re amazing', at('standard', { priorTargetedCount: 10 }))).tier).toBe('GREEN');
  });
});

describe('minors are capped at Standard', () => {
  test('a minor sender, or a DM to a minor, is judged against min(room, Standard)', async () => {
    expect(await tierOf(RUNG.open, at('max', { senderIsAdult: false }))).toBe('ORANGE');
    expect(await tierOf(RUNG.open, { surface: 'dm', roomLevel: 'max', recipientIsMinor: true, senderIsAdult: false })).toBe('ORANGE');
    expect(await tierOf(RUNG.standard, at('max', { senderIsAdult: false }))).toBe('GREEN');
  });
  test('viewer side: a minor’s effective level never goes above Standard, and they get no Show', () => {
    expect(effectiveLevel('max', 'max', false)).toBe('standard');
    expect(effectiveLevel('max', 'open', true)).toBe('open');
    expect(effectiveLevel('family', 'max', true)).toBe('family');
    expect(allowedLevels(false)).toEqual(['family', 'standard']);
    expect(displayFor(RUNG.open, 'open', 'standard', false)).toEqual({ mode: 'hidden', canReveal: false });
    expect(displayFor(RUNG.open, 'open', 'standard', true)).toEqual({ mode: 'hidden', canReveal: true });
  });
});

describe('viewer display: masking for Family', () => {
  test('swear-only messages are masked, not hidden', () => {
    expect(displayFor('holy shit this slaps', 'standard', 'family', true)).toEqual({ mode: 'masked', text: 'holy **** this slaps' });
  });
  test('an insult is hidden (not masked) from a Family viewer', () => {
    expect(displayFor('you’re an idiot', 'standard', 'family', true).mode).toBe('hidden');
  });
  test('at or below the effective level it just shows', () => {
    expect(displayFor('holy shit', 'standard', 'standard', false)).toEqual({ mode: 'show', text: 'holy shit' });
  });
});

describe('behaviour contract', () => {
  test('each tier maps to one action and sender copy', async () => {
    const cases: [string, Tier, string | null][] = [
      ['great stream tonight', 'GREEN', null],
      ['you’re an idiot', 'YELLOW', YELLOW_PROMPT],
      ['lets all go after @jess', 'ORANGE', copy.orange.body('asks other people to go after a specific person')],
      ['kys', 'RED', copy.red.body('tells someone to hurt or kill themselves')],
    ];
    for (const [text, tier, msg] of cases) {
      const v = await evaluate(text, at('standard'));
      expect(v.tier).toBe(tier);
      expect(v.action).toBe(TIER_ACTION[tier]);
      expect(senderMessage(v)).toBe(msg);
    }
  });

  test('no copy ever says "guidelines"', async () => {
    for (const text of ['kys', 'send nudes', 'I know where you live', '@jess lives at 12 Oak Street', 'give me your password', 'holy shit']) {
      for (const lvl of SPEECH_LEVELS) {
        const v = await evaluate(text, at(lvl));
        expect((senderMessage(v) ?? '').toLowerCase()).not.toContain('guideline');
        for (const r of v.reasons) expect(r.plainMessage.toLowerCase()).not.toContain('guideline');
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
    { id: 'p1', text: 'p1', grade: 'open', policy_ref: 'open.roast' },
    { id: 'p2', text: 'p2', grade: 'open', policy_ref: 'open.roast' },
    { id: 'p3', text: 'p3', grade: 'open', policy_ref: 'open.roast' },
    { id: 'f1', text: 'f1', grade: 'family', policy_ref: 'family.everyday' },
  ];
  const toy = (vec: Float32Array, calls: string[] = []): StageBDeps => ({
    embed: async (t) => {
      calls.push(t);
      return vec;
    },
    index: buildIndex(toyExamples, (e) => (e.grade === 'open' ? axis(1) : axis(0))),
    config: { k: 3, minSimilarity: 0.9, minShare: 0.6, redSimilarity: 0.99 },
  });

  test('stage B raises a targeted message stage A missed, naming the policy section', async () => {
    const v = await evaluate('your nose looks like a potato chip', at('max', { relationship: 'friends' }), toy(axis(1)));
    expect(v.requiredLevel).toBe('open');
    const b = v.reasons.find((r) => r.stage === 'B')!;
    expect(b.code).toBe('similar_example');
    expect(b.policyRef).toBe('open.roast');
    expect(b.plainMessage).toBe('It reads like roasting someone.');
  });

  test('a stage-B roast aimed at a stranger is bullying', async () => {
    const v = await evaluate('your nose looks like a potato chip', at('max'), toy(axis(1)));
    expect(v.tier).toBe('ORANGE');
    expect(v.reasons[0].code).toBe('bullying_stranger');
  });

  test('stage B never runs without a target (no embedding call at all)', async () => {
    const calls: string[] = [];
    const v = await evaluate('everything is falling apart and I hate it', at('family'), toy(axis(1), calls));
    expect(v.tier).toBe('GREEN');
    expect(calls).toEqual([]);
    expect(v.timings.stageBSkipped).toBe('no_target');
  });

  test('stage B is skipped when stage A already reached the ceiling', async () => {
    const calls: string[] = [];
    const v = await evaluate('kys', at('standard'), toy(axis(1), calls));
    expect(calls).toEqual([]);
    expect(v.timings.stageBSkipped).toBe('decided_by_stage_a');
  });

  test('stage B never lowers stage A', async () => {
    const v = await evaluate('you’re an idiot', at('standard'), toy(axis(0)));
    expect(v.tier).toBe('YELLOW');
  });

  test('an embedder failure keeps the stage A verdict (and says so)', async () => {
    const broken: StageBDeps = { ...toy(axis(1)), embed: async () => { throw new Error('model down'); } };
    const v = await evaluate('you’re an idiot', at('standard'), broken);
    expect(v.tier).toBe('YELLOW');
    expect(v.timings.stageBSkipped).toBe('no_embedder');
  });
});

describe('the never-sentiment corpus through the full pipeline (fallback embedder), at all 4 levels', () => {
  test(`all ${SENTIMENT_CORPUS.length} texts: never a ceiling, never a mirror; Family-clean unless they swear`, async () => {
    const wrong: string[] = [];
    for (const text of SENTIMENT_CORPUS) {
      for (const level of SPEECH_LEVELS) {
        for (const ctx of [
          { surface: 'live_chat', roomLevel: level } as EvalContext,
          { surface: 'dm', roomLevel: level, recipientIsMinor: true } as EvalContext,
          { surface: 'comment', roomLevel: level } as EvalContext,
        ]) {
          const v = await evaluate(text, ctx, fallbackB);
          const swearOnly = v.reasons.every((r) => r.code === 'profanity' || r.code === 'above_room_level');
          const ok = v.ceiling === null && v.tier !== 'YELLOW' && v.tier !== 'RED' && (v.tier === 'GREEN' || swearOnly);
          if (!ok) wrong.push(`${text} [${ctx.surface}/${level}] => ${v.tier} ${v.reasons.map((r) => `${r.code}:${r.policyRef}`)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
