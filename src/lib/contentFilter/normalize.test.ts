import { describe, expect, test } from 'bun:test';

import { compileWords, normalize, toOriginalSpan } from './normalize.ts';

/** The folded view of a plain word, for readable expectations. */
const f = (s: string) => normalize(s).folded;

describe('normalize — each evasion trick folds to the same form as the plain word', () => {
  const same = (trick: string, plain: string) => expect(f(trick)).toBe(f(plain));

  test('case and NFKC: fullwidth and mathematical letters', () => {
    same('ＩＤＩＯＴ', 'idiot');
    same('𝐢𝐝𝐢𝐨𝐭', 'idiot');
    same('ⓘⓓⓘⓞⓣ', 'idiot');
  });

  test('zero-width characters and soft hyphens are removed', () => {
    same('id​i‌ot', 'idiot');
    same('lo­ser', 'loser');
    same('i⁠d﻿iot', 'idiot');
  });

  test('combining marks (zalgo, accents) are stripped', () => {
    same('ï̴d̷ḯ̶o̸t̵', 'idiot');
    same('lösér', 'loser');
  });

  test('homoglyphs: Cyrillic and Greek lookalikes fold to Latin', () => {
    same('іdіоt', 'idiot'); // Cyrillic і, о
    same('ѕtuріd', 'stupid'); // Cyrillic ѕ, р
    same('ιdιοt', 'idiot'); // Greek ι, ο
    same('lоѕеr', 'loser');
  });

  test('leetspeak folds inside words', () => {
    same('1d10t', 'idiot');
    same('l0s3r', 'loser');
    same('stup1d', 'stupid');
    same('m0r0n', 'moron');
    same('k1ll y0urs3lf', 'kill yourself');
    same('b@stard', 'bastard');
    same('a$$hole', 'asshole');
    same('7ra$h', 'trash');
  });

  test('repeated letters collapse', () => {
    same('idiooooot', 'idiot');
    same('loooooser', 'loser');
    same('stuuuupiiid', 'stupid');
  });

  test('inter-letter spacing and punctuation tricks join in the joined view', () => {
    expect(normalize('f u c k you').joined).toContain(f('fuck'));
    expect(normalize('f.u.c.k you').joined).toContain(f('fuck'));
    expect(normalize('k-y-s').joined).toBe(f('kys'));
    expect(normalize('i d i o t').joined).toBe(f('idiot'));
    expect(normalize('l_o_s_e_r').joined).toBe(f('loser'));
  });

  test('targeted emoji become words', () => {
    expect(normalize('you 🤡').folded).toBe(f('you clown'));
    expect(normalize('🔪🔪 tonight').folded).toContain(f('knife'));
    expect(normalize('🖕').folded).toBe(f('fuck you'));
  });

  test('skin tones and variation selectors vanish', () => {
    expect(normalize('🖕🏽').folded).toBe(f('fuck you'));
  });

  test('trailing punctuation is not leet: "idiot!!!" is still idiot', () => {
    same('idiot!!!', 'idiot');
    same('(loser)', 'loser');
  });

  test('pure numbers stay numbers; mentions keep their @', () => {
    expect(normalize('call 555 0100').folded).toContain('555 0100');
    expect(normalize('@sam hi').folded.startsWith('@sam')).toBe(true);
    expect(normalize('hey @Sam_99').plain).toContain('@sam_99');
  });

  test('apostrophes join contractions', () => {
    expect(f("you're")).toBe(f('youre'));
    expect(f('you’re')).toBe(f('youre'));
  });

  test('plain view keeps digits and punctuation for phone/address rules', () => {
    expect(normalize('Call 555-010-0199').plain).toBe('call 555-010-0199');
  });
});

describe('span mapping', () => {
  test('a span in the folded view maps back to the original text', () => {
    const text = 'hey Ｉ𝐝𝐢𝐨𝐭!!';
    const n = normalize(text);
    const idx = n.folded.indexOf(f('idiot'));
    const [s, e] = toOriginalSpan(n.foldedMap, idx, idx + f('idiot').length, text.length);
    expect(text.slice(s, e)).toBe('Ｉ𝐝𝐢𝐨𝐭');
  });

  test('joined-view spans cover the spaced-out letters', () => {
    const text = 'ok f u c k you';
    const n = normalize(text);
    const idx = n.joined.indexOf(f('fuck'));
    const [s, e] = toOriginalSpan(n.joinedMap, idx, idx + f('fuck').length, text.length);
    expect(text.slice(s, e)).toBe('f u c k');
  });
});

describe('compileWords', () => {
  test('patterns written as plain words match folded text', () => {
    const rx = compileWords(String.raw`\bkill\s+yourself\b`);
    expect(rx.test(f('k1ll yourselllf'))).toBe(true);
    expect(rx.test(f('kiss yourself'))).toBe(false);
  });

  test('regex escapes survive compilation (\\b before a word starting with b)', () => {
    const rx = compileWords(String.raw`\bbastard\b`);
    expect(rx.test(f('b@stard'))).toBe(true);
    expect(rx.test(f('abastard'))).toBe(false);
  });
});

describe('performance', () => {
  test('normalizing a 300-char message takes well under a millisecond', () => {
    const msg = 'Honestly this stream is the best part of my week, thank you all so much 🙏 '.repeat(4);
    for (let i = 0; i < 200; i++) normalize(msg); // warm
    const t0 = performance.now();
    const N = 2000;
    for (let i = 0; i < N; i++) normalize(msg);
    const per = (performance.now() - t0) / N;
    expect(per).toBeLessThan(0.5);
  });
});
