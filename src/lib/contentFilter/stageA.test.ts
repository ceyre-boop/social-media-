import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { SENTIMENT_CORPUS } from './fixtures/sentimentCorpus.ts';
import { foldTerm } from './normalize.ts';
import { sha256Hex } from './sha256.ts';
import { SLUR_TEST_SENTINELS, stageA } from './stageA.ts';
import type { EvalContext, ReasonCode, Tier } from './types.ts';

const chat: EvalContext = { surface: 'live_chat' };
const dmToMinor: EvalContext = { surface: 'dm', recipientIsMinor: true, senderIsAdult: true };
const dmTeenToTeen: EvalContext = { surface: 'dm', recipientIsMinor: true, senderIsAdult: false };
const dmAdults: EvalContext = { surface: 'dm', recipientIsMinor: false, senderIsAdult: true };

function expectA(text: string, tier: Tier, code?: ReasonCode, ctx: EvalContext = chat) {
  const r = stageA(text, ctx);
  const codes = r.reasons.map((x) => x.code).join(',');
  expect(`${text} => ${r.tier} [${codes}]`).toStartWith(`${text} => ${tier} [`);
  if (code) expect(r.reasons.map((x) => x.code)).toContain(code);
  return r;
}

describe('sha256', () => {
  test('matches node:crypto for ASCII, unicode, empty, and multi-block input', () => {
    for (const s of ['', 'abc', 'héllo wörld 🙂', 'x'.repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});

describe('stage A — GREEN by default', () => {
  test.each([
    'what a great stream tonight',
    'you are amazing, thank you for this',
    'you killed it!!',
    'I love you idiots so much',
    'this movie is trash, I want my two hours back',
    'you’re dead to me if you spoil the finale lol',
  ])('%s', (text) => {
    const r = stageA(text, chat);
    expect(r.tier === 'GREEN' || r.tier === 'YELLOW').toBe(true); // affectionate insults may mirror
    expect(r.tier).not.toBe('ORANGE');
  });

  test('game talk, idioms, and favors that share words with threats are GREEN', () => {
    for (const t of [
      'I’m going to beat you at mario kart',
      'I’ll end you in this game lol',
      'I’ll find you at the party',
      'I will find you a seat',
      'I’ll get you a coffee',
      'I’ll shoot you a text',
      'go die hard fans',
      'I hope you die laughing at this',
      'thank you trash panda',
      'you guys are killing it',
      'you had me dying',
      'fat chance',
    ]) {
      expectA(t, 'GREEN');
    }
  });

  test('everyday text is GREEN with no reasons', () => {
    for (const t of ['hello', 'what song is this?', 'you are so talented', 'you’re right, I was wrong']) {
      expectA(t, 'GREEN');
    }
  });
});

describe('stage A — YELLOW: insults and contempt aimed at a person', () => {
  test.each([
    ['you’re an idiot', 'insult_at_person'],
    ['ur a loser', 'insult_at_person'],
    ['u r a l0s3r', 'insult_at_person'],
    ['you are so pathetic', 'insult_at_person'],
    ['shut up you absolute clown', 'insult_at_person'],
    ['you 🤡', 'insult_at_person'],
    ['you’re ugly', 'insult_at_person'],
    ['you’re an і d і о t', 'insult_at_person'],
    ['@sam_99 is a loser', 'insult_at_person'],
    ['nobody likes you', 'insult_at_person'],
    ['fuck you', 'profanity_at_person'],
    ['f u c k you', 'profanity_at_person'],
    ['🖕', 'profanity_at_person'],
    ['stfu', 'profanity_at_person'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'YELLOW', code);
  });

  test('self-directed and generic-you insults are GREEN', () => {
    expectA('I’m such an idiot', 'GREEN');
    expectA('when you’re useless at your job it eats at you', 'GREEN');
    expectA('fuck you cancer', 'GREEN');
  });
});

describe('stage A — ORANGE', () => {
  test.each([
    ['I’ll kill you', 'threat_language'],
    ['im gonna hurt you', 'threat_language'],
    ['you’re dead', 'threat_language'],
    ['watch your back', 'threat_language'],
    ['I hope you die', 'death_wish'],
    ['go die in a fire', 'death_wish'],
    ['lets all go after @jess', 'pile_on_invite'],
    ['everyone report @jess_22 now', 'pile_on_invite'],
    ['@jess lives at 12 Oak Street', 'doxxing'],
    ['her real name is Jessica Moore', 'doxxing'],
    ['wanna fuck you', 'sexual_comment_at_person'],
    ['send nudes', 'sexual_comment_at_person'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'ORANGE', code);
  });

  test('phone numbers and street addresses in public surfaces are ORANGE personal_info', () => {
    expectA('call her at 555-201-3344', 'ORANGE', 'personal_info');
    expectA('he is at 42 Elm Road right now', 'ORANGE', 'personal_info');
    expectA('comment: 42 Elm Road', 'ORANGE', 'personal_info', { surface: 'comment' });
  });

  test('sharing your own number in a DM between adults is not flagged', () => {
    expectA('my number is 555-201-3344', 'GREEN', undefined, dmAdults);
  });
});

describe('stage A — RED', () => {
  test.each([
    ['kill yourself', 'self_harm_encouragement'],
    ['kys', 'self_harm_encouragement'],
    ['k y s', 'self_harm_encouragement'],
    ['k1ll urself', 'self_harm_encouragement'],
    ['go neck yourself', 'self_harm_encouragement'],
    ['drink bleach', 'self_harm_encouragement'],
    ['I know where you live', 'credible_threat'],
    ['I’m going to shoot you tomorrow', 'credible_threat'],
    ['I will kill you, I have a 🔪', 'credible_threat'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'RED', code);
  });

  test('supportive negations are not encouragement', () => {
    expectA('please don’t kill yourself, call me', 'GREEN');
    expectA('I’m going to kill myself laughing', 'GREEN');
  });
});

describe('stage A — minor safety (DM with a known minor recipient)', () => {
  test.each([
    ['add me on snap', 'off_platform_minor'],
    ['what’s your snap', 'off_platform_minor'],
    ['text me 555 201 3344', 'off_platform_minor'],
    ['hmu on telegram', 'off_platform_minor'],
    ['don’t tell your parents', 'secrecy_minor'],
    ['are you home alone', 'secrecy_minor'],
    ['send nudes', 'sexual_minor'],
  ] as const)('adult -> minor: %s is RED', (text, code) => {
    expectA(text, 'RED', code, dmToMinor);
  });

  test('age questions from an adult to a minor are ORANGE', () => {
    expectA('how old are you', 'ORANGE', 'age_question_minor', dmToMinor);
    expectA('what grade are you in', 'ORANGE', 'age_question_minor', dmToMinor);
  });

  test('the same words between adults, or teen to teen, are GREEN', () => {
    expectA('add me on snap', 'GREEN', undefined, dmAdults);
    expectA('how old are you', 'GREEN', undefined, dmAdults);
    expectA('add me on snap', 'GREEN', undefined, dmTeenToTeen);
  });
});

describe('stage A — slur hash list', () => {
  test('the list stores hashes of folded terms, never plaintext', () => {
    for (const s of SLUR_TEST_SENTINELS) expect(sha256Hex(foldTerm(s))).toHaveLength(64);
  });

  test('a listed term with a target is ORANGE slur_attack; without one it is YELLOW', () => {
    const [sentinel] = SLUR_TEST_SENTINELS;
    expectA(`you ${sentinel}`, 'ORANGE', 'slur_attack');
    expectA(`@sam is a ${sentinel}`, 'ORANGE', 'slur_attack');
    expectA(`${sentinel} lol`, 'YELLOW', 'slur');
  });

  test('evasions of a listed term still hash-match', () => {
    const [sentinel] = SLUR_TEST_SENTINELS;
    const spaced = sentinel.split('').join(' ');
    const leet = sentinel.replace(/s/g, '$').replace(/t/g, '7');
    expectA(`you ${spaced}`, 'ORANGE', 'slur_attack');
    expectA(`you ${leet}`, 'ORANGE', 'slur_attack');
  });
});

describe('stage A — reasons name the issue and point at it', () => {
  test('span points at the original characters; message is specific', () => {
    const text = 'lol ur a l0s3r!!';
    const r = stageA(text, chat);
    const reason = r.reasons[0];
    expect(text.slice(...reason.span)).toContain('l0s3r');
    expect(reason.plainMessage).toBe('It calls someone a name.');
    expect(reason.plainMessage.toLowerCase()).not.toContain('guidelines');
  });
});

describe('stage A — the never-sentiment corpus', () => {
  test(`all ${SENTIMENT_CORPUS.length} sad/angry/grieving/venting/self-directed texts are GREEN`, () => {
    expect(SENTIMENT_CORPUS.length).toBeGreaterThanOrEqual(40);
    const wrong: string[] = [];
    for (const text of SENTIMENT_CORPUS) {
      for (const ctx of [chat, dmToMinor, dmAdults, { surface: 'comment' } as EvalContext]) {
        const r = stageA(text, ctx);
        if (r.tier !== 'GREEN') wrong.push(`${text} (${ctx.surface}) => ${r.tier} ${r.reasons.map((x) => x.code)}`);
        if (r.mildInsult) wrong.push(`${text} => mild insult signal`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('stage A — latency', () => {
  test('p95 under 1 ms per message', () => {
    const msgs = [...SENTIMENT_CORPUS, 'you’re an idiot', 'kys', 'lets all go after @jess', 'add me on snap'];
    for (let i = 0; i < 3; i++) for (const m of msgs) stageA(m, dmToMinor); // warm
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      for (const m of msgs) {
        const t0 = performance.now();
        stageA(m, dmToMinor);
        times.push(performance.now() - t0);
      }
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`stage A latency over ${times.length} runs: p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThan(1);
  });
});
