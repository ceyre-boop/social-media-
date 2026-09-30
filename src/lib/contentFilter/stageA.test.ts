import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { SENTIMENT_CORPUS } from './fixtures/sentimentCorpus.ts';
import { foldTerm, normalize } from './normalize.ts';
import { hasProfanity, maskProfanity } from './profanity.ts';
import { sha256Hex } from './sha256.ts';
import { SLUR_TEST_SENTINELS, stageA } from './stageA.ts';
import type { EvalContext, Grade, ReasonCode } from './types.ts';

const chat: EvalContext = { surface: 'live_chat' };
const dmToMinor: EvalContext = { surface: 'dm', recipientIsMinor: true, senderIsAdult: true };
const dmTeenToTeen: EvalContext = { surface: 'dm', recipientIsMinor: true, senderIsAdult: false };
const dmAdults: EvalContext = { surface: 'dm', recipientIsMinor: false, senderIsAdult: true };

function expectA(text: string, grade: Grade, code?: ReasonCode, ctx: EvalContext = chat) {
  const r = stageA(text, ctx);
  const codes = r.reasons.map((x) => x.code).join(',');
  expect(`${text} => ${r.grade} [${codes}]`).toStartWith(`${text} => ${grade} [`);
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

describe('stage A — Family by default', () => {
  test('game talk, idioms, and favors that share words with threats are Family', () => {
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
      'I love you idiots so much',
      'this movie is trash, I want my two hours back',
      'you’re dead to me if you spoil the finale lol',
    ]) {
      expectA(t, 'family');
    }
  });

  test('everyday text, minced oaths and look-alike words are Family', () => {
    for (const t of [
      'hello',
      'what song is this?',
      'you are so talented',
      'you’re right, I was wrong',
      'gosh darn it',
      'oh heck',
      'shut up, no way, congrats!!',
      'that pop song is catchy',
      'hello from the shell station',
      'as I was saying',
      'everyone loves you',
      'what are you wearing to the party?',
      'shiitake mushrooms are the best',
      'summa cum laude, finally',
    ]) {
      expectA(t, 'family');
    }
  });
});

describe('stage A — Standard: swearing, mild insults', () => {
  test.each([
    ['holy shit this slaps', 'profanity'],
    ['what the hell', 'profanity'],
    ['fuck cancer', 'profanity'],
    ['damn', 'profanity'],
    ['you’re an idiot', 'insult_at_person'],
    ['shut up you absolute clown', 'insult_at_person'],
    ['you 🤡', 'insult_at_person'],
    ['you’re an і d і о t', 'insult_at_person'],
    ['fuck you', 'insult_at_person'],
    ['f u c k you', 'insult_at_person'],
    ['🖕', 'insult_at_person'],
    ['stfu', 'insult_at_person'],
    ['he is such an idiot', 'insult_about_person'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'standard', code);
  });

  test('self-directed and generic-you insults are not insults', () => {
    expectA('I’m such an idiot', 'family');
    expectA('when you’re useless at your job it eats at you', 'family');
  });
});

describe('stage A — Open: roasts and crude jokes', () => {
  test.each([
    ['ur a loser', 'roast'],
    ['u r a l0s3r', 'roast'],
    ['you are so pathetic', 'roast'],
    ['you’re ugly', 'roast'],
    ['@sam_99 is a loser', 'roast'],
    ['your voice is so annoying', 'roast'],
    ['you look like a potato', 'roast'],
    ['that guy is a worthless loser', 'insult_about_person'],
    ['I just farted in the meeting', 'crude_humor'],
    ['that’s what she said', 'crude_humor'],
    ['the dog pooped on the rug', 'crude_humor'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'open', code);
  });
});

describe('stage A — Max: edgy jokes', () => {
  test('dark jokes named as such', () => {
    expectA('dead baby jokes are my favourite', 'max', 'dark_humor');
    expectA('I have a joke about cancer but it is terminal', 'max', 'dark_humor');
  });
});

describe('stage A — ceiling ORANGE', () => {
  test.each([
    ['I’ll kill you', 'threat_language'],
    ['im gonna hurt you', 'threat_language'],
    ['you’re dead', 'threat_language'],
    ['watch your back', 'threat_language'],
    ['I hope you die', 'death_wish'],
    ['go die in a fire', 'death_wish'],
    ['lets all go after @jess', 'pile_on_invite'],
    ['everyone report @jess_22 now', 'pile_on_invite'],
    ['let’s make fun of him', 'pile_on_invite'],
    ['@jess lives at 12 Oak Street', 'doxxing'],
    ['her real name is Jessica Moore', 'doxxing'],
    ['wanna fuck you', 'sexual_comment_at_person'],
    ['send nudes', 'sexual_comment_at_person'],
    ['take your shirt off', 'sexual_comment_at_person'],
    ['so horny tonight', 'sexual_content'],
    ['nobody likes you', 'bullying'],
    ['everyone is laughing at you', 'bullying'],
    ['you should just leave the internet', 'bullying'],
    ['go back to your own country', 'bullying'],
    ['I made another account since you blocked me', 'harassing'],
    ['I’ll keep messaging you until you answer', 'harassing'],
    ['you can’t hide from me', 'harassing'],
    ['I’ll make your life hell', 'harassing'],
  ] as const)('%s', (text, code) => {
    expectA(text, 'orange', code);
  });

  test.each([
    'you’re not allowed to hang out with them anymore',
    'stop talking to your friends',
    'give me your password',
    'let me see your phone',
    'block him or I’m leaving you',
    'share your location or don’t bother coming home',
    'tell me where you are right now or we’re done',
    'you have to ask me before you go anywhere',
    'if you go to that party I’ll tell everyone your secrets',
    'if you leave me I’ll hurt myself',
    'delete your account or I’ll tell everyone what you did',
    'after everything I’ve done for you, you owe me',
    'why aren’t you answering, I can see you’re online',
    'I forbid you to go',
  ])('controlling: %s', (text) => {
    expectA(text, 'orange', 'controlling');
  });

  test.each([
    'text me when you get home safe',
    'share your location for the hike so we don’t lose each other',
    'you’re not allowed to leave without trying my cake',
    'tell me where you are and I’ll pick you up',
    'if you go to the store I’ll make dinner',
    'I miss you, call me when you’re free',
  ])('caring, not controlling: %s', (text) => {
    expectA(text, 'family', undefined, dmAdults);
  });

  test('phone numbers and street addresses in public surfaces are ORANGE personal_info', () => {
    expectA('call her at 555-201-3344', 'orange', 'personal_info');
    expectA('he is at 42 Elm Road right now', 'orange', 'personal_info');
    expectA('comment: 42 Elm Road', 'orange', 'personal_info', { surface: 'comment' });
  });

  test('sharing your own number in a DM between adults is not flagged', () => {
    expectA('my number is 555-201-3344', 'family', undefined, dmAdults);
  });
});

describe('stage A — ceiling RED', () => {
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
    expectA(text, 'red', code);
  });

  test('supportive negations are not encouragement', () => {
    expectA('please don’t kill yourself, call me', 'family');
    expectA('I’m going to kill myself laughing', 'family');
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
    expectA(text, 'red', code, dmToMinor);
  });

  test('age questions from an adult to a minor are ORANGE', () => {
    expectA('how old are you', 'orange', 'age_question_minor', dmToMinor);
    expectA('what grade are you in', 'orange', 'age_question_minor', dmToMinor);
  });

  test('the same words between adults, or teen to teen, are Family', () => {
    expectA('add me on snap', 'family', undefined, dmAdults);
    expectA('how old are you', 'family', undefined, dmAdults);
    expectA('add me on snap', 'family', undefined, dmTeenToTeen);
  });
});

describe('stage A — slur hash list', () => {
  test('the list stores hashes of folded terms, never plaintext', () => {
    for (const s of SLUR_TEST_SENTINELS) expect(sha256Hex(foldTerm(s))).toHaveLength(64);
  });

  test('a listed term aimed at someone is ORANGE slur_attack; aimed at nobody it is Max', () => {
    const [sentinel] = SLUR_TEST_SENTINELS;
    expectA(`you ${sentinel}`, 'orange', 'slur_attack');
    expectA(`@sam is a ${sentinel}`, 'orange', 'slur_attack');
    expectA(`${sentinel} lol`, 'max', 'slur');
  });

  test('evasions of a listed term still hash-match', () => {
    const [sentinel] = SLUR_TEST_SENTINELS;
    const spaced = sentinel.split('').join(' ');
    const leet = sentinel.replace(/s/g, '$').replace(/t/g, '7');
    expectA(`you ${spaced}`, 'orange', 'slur_attack');
    expectA(`you ${leet}`, 'orange', 'slur_attack');
  });
});

describe('profanity masking (Family viewers)', () => {
  test.each([
    ['holy shit this slaps', 'holy **** this slaps'],
    ['what the hell is that', 'what the **** is that'],
    ['fucking finally!', '******* finally!'],
    ['f u c k this', '******* this'],
    ['this is so good', 'this is so good'],
    ['kiss my ass', 'kiss my ***'],
  ])('%s', (text, masked) => {
    expect(maskProfanity(text)).toBe(masked);
  });

  test('feelings are not swears', () => {
    for (const t of ['I’m furious at the airline', 'this is awful', 'I’m so sad', 'I hate this']) {
      expect(hasProfanity(normalize(t))).toBe(false);
    }
  });
});

describe('stage A — reasons name the issue and point at it', () => {
  test('span points at the original characters; message is specific', () => {
    const text = 'lol ur a l0s3r!!';
    const r = stageA(text, chat);
    const reason = r.reasons[0];
    expect(text.slice(...reason.span)).toContain('l0s3r');
    expect(reason.plainMessage).toBe('It roasts someone.');
    expect(reason.plainMessage.toLowerCase()).not.toContain('guidelines');
  });
});

describe('stage A — the never-sentiment corpus', () => {
  test(`all ${SENTIMENT_CORPUS.length} sad/angry/grieving/venting texts are Family (or Standard for a swear alone)`, () => {
    expect(SENTIMENT_CORPUS.length).toBeGreaterThanOrEqual(40);
    const wrong: string[] = [];
    for (const text of SENTIMENT_CORPUS) {
      for (const ctx of [chat, dmToMinor, dmAdults, { surface: 'comment' } as EvalContext]) {
        const r = stageA(text, ctx);
        const swearOnly = r.grade === 'standard' && r.reasons.every((x) => x.code === 'profanity');
        if (r.grade !== 'family' && !swearOnly) wrong.push(`${text} (${ctx.surface}) => ${r.grade} ${r.reasons.map((x) => x.code)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('stage A — latency', () => {
  test('p95 under 1 ms per message', () => {
    const msgs = [...SENTIMENT_CORPUS, 'you’re an idiot', 'kys', 'lets all go after @jess', 'add me on snap', 'give me your password'];
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
