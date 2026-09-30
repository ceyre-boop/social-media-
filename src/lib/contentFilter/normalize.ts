/**
 * content_filter normalization. Runs before every stage-A rule so the rules match intent rather
 * than spelling: otherwise stage A is whack-a-mole forever (brief-milestone-3 §5).
 *
 * Three views of one message, each with a per-character map back to the ORIGINAL text so a
 * reason can point at exactly what the sender typed:
 *
 *   plain   NFKD + compatibility folding (fullwidth, math alphanumerics, circled letters),
 *           zero-width / combining marks / skin tones stripped, lowercased, Cyrillic/Greek
 *           lookalikes folded to Latin, a few targeted emoji spelled as words. Digits and
 *           punctuation intact: phone-number and address rules read this view.
 *   folded  plain + leetspeak folded inside words, punctuation to spaces, apostrophes joined,
 *           the "skeleton" fold (l and 1 read as i, so l/1/I/| confusions all meet), and runs of
 *           a repeated letter collapsed to one. Mentions (@handle) are kept verbatim.
 *   joined  folded, with runs of 3+ single-letter tokens joined ("f u c k" -> "fuck").
 *
 * Rules are written as plain lowercase words and compiled with `compileWords`, which applies the
 * same skeleton + collapse, so authors never hand-write folded spellings.
 */

/** [start, end) in the original string for one normalized character. */
export type Span = [number, number];

export type Normalized = {
  original: string;
  plain: string;
  plainMap: Span[];
  folded: string;
  foldedMap: Span[];
  joined: string;
  joinedMap: Span[];
};

type Ch = { c: string; s: number; e: number; mention?: boolean };

const INVISIBLE =
  /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]|\p{Emoji_Modifier}|[\u{E0000}-\u{E007F}]/u;
const MARK = /\p{M}/u;

const HOMOGLYPH: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', ѕ: 's', і: 'i', ї: 'i', ј: 'j', ԁ: 'd', ӏ: 'l', ԛ: 'q', ԝ: 'w', ү: 'y', һ: 'h', ь: 'b',
  // Greek
  α: 'a', β: 'b', ε: 'e', ζ: 'z', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', ς: 's',
  τ: 't', υ: 'u', χ: 'x', ω: 'w',
  // Latin lookalikes that NFKD does not decompose
  ı: 'i', ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ß: 'ss', ɡ: 'g', ſ: 's',
};

/**
 * A deliberately small, targeted set: emoji commonly used as an insult, a threat, or a gesture.
 * Not a sentiment map — crying, sad, or angry faces are never translated.
 */
const EMOJI_WORD: Record<string, string> = {
  '🤡': 'clown',
  '🐷': 'pig',
  '🐖': 'pig',
  '🐽': 'pig',
  '🐀': 'rat',
  '🐍': 'snake',
  '🗑': 'trash',
  '🐒': 'monkey',
  '🐵': 'monkey',
  '🦍': 'ape',
  '🔪': 'knife',
  '🗡': 'knife',
  '🔫': 'gun',
  '💣': 'bomb',
  '🖕': 'fuck you',
};

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e',
};

const APOSTROPHE = /['’‘`´ʼ]/;
const LETTER = /[a-z]/;
const ALNUM = /[a-z0-9]/;

function plainChars(text: string): Ch[] {
  const out: Ch[] = [];
  let i = 0;
  for (const cp of text) {
    const s = i;
    const e = i + cp.length;
    i = e;
    if (INVISIBLE.test(cp)) continue;
    const word = EMOJI_WORD[cp];
    if (word) {
      for (const c of ` ${word} `) out.push({ c, s, e });
      continue;
    }
    for (const d of cp.normalize('NFKD')) {
      for (const l of d.toLowerCase().normalize('NFKD')) {
        if (MARK.test(l)) continue;
        const h = HOMOGLYPH[l] ?? l;
        for (const c of h) out.push({ c, s, e });
      }
    }
  }
  return out;
}

function isSpace(c: string) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

/** Leetspeak folding, per whitespace token, only inside tokens that contain a letter. */
function foldLeet(chars: Ch[]): Ch[] {
  const out: Ch[] = [];
  let k = 0;
  while (k < chars.length) {
    if (isSpace(chars[k].c)) {
      out.push(chars[k++]);
      continue;
    }
    let end = k;
    while (end < chars.length && !isSpace(chars[end].c)) end++;
    const tok = chars.slice(k, end);
    k = end;
    // Mention: @handle is kept verbatim (it names an account).
    if (tok[0].c === '@' && tok.length > 1 && /[a-z0-9_]/.test(tok[1].c)) {
      let j = 1;
      while (j < tok.length && /[a-z0-9_.]/.test(tok[j].c)) j++;
      while (j > 1 && tok[j - 1].c === '.') j--; // trailing dot is punctuation
      for (let m = 0; m < j; m++) out.push({ ...tok[m], mention: true });
      for (let m = j; m < tok.length; m++) out.push(tok[m]);
      continue;
    }
    let a = 0;
    let b = tok.length;
    while (a < b && !/[a-z0-9@$]/.test(tok[a].c)) a++;
    while (b > a && !/[a-z0-9$]/.test(tok[b - 1].c)) b--;
    let hasLetter = false;
    for (let m = a; m < b; m++) if (LETTER.test(tok[m].c)) hasLetter = true;
    for (let m = 0; m < tok.length; m++) {
      const ch = tok[m];
      const inCore = m >= a && m < b;
      const leet = inCore && hasLetter ? LEET[ch.c] : undefined;
      out.push(leet ? { ...ch, c: leet } : ch);
    }
  }
  return out;
}

function foldChars(plain: Ch[]): Ch[] {
  const leet = foldLeet(plain);
  const out: Ch[] = [];
  for (const ch of leet) {
    if (ch.mention) {
      out.push(ch);
      continue;
    }
    if (APOSTROPHE.test(ch.c)) continue; // you're -> youre
    let c = ALNUM.test(ch.c) ? ch.c : ' ';
    if (c === 'l') c = 'i'; // skeleton: l / 1 / I / | all meet at i
    const prev = out[out.length - 1];
    if (c === ' ' && (!prev || prev.c === ' ')) continue; // collapse spaces
    if (LETTER.test(c) && prev && !prev.mention && prev.c === c) continue; // collapse repeats
    out.push({ ...ch, c });
  }
  while (out.length && out[out.length - 1].c === ' ') out.pop();
  return out;
}

/** Joins runs of 3+ single-letter tokens: "f u c k" -> "fuck". */
function joinSingles(folded: Ch[]): Ch[] {
  const tokens: Ch[][] = [];
  let cur: Ch[] = [];
  for (const ch of folded) {
    if (ch.c === ' ') {
      if (cur.length) tokens.push(cur);
      cur = [];
    } else cur.push(ch);
  }
  if (cur.length) tokens.push(cur);

  const single = (t: Ch[]) => t.length === 1 && LETTER.test(t[0].c) && !t[0].mention;
  const merged: Ch[][] = [];
  let t = 0;
  while (t < tokens.length) {
    if (single(tokens[t])) {
      let u = t;
      while (u < tokens.length && single(tokens[u])) u++;
      if (u - t >= 3) {
        const word: Ch[] = [];
        for (let v = t; v < u; v++) {
          const ch = tokens[v][0];
          if (word.length && word[word.length - 1].c === ch.c) continue;
          word.push(ch);
        }
        merged.push(word);
        t = u;
        continue;
      }
    }
    merged.push(tokens[t++]);
  }

  const out: Ch[] = [];
  for (const tok of merged) {
    if (out.length) {
      const last = out[out.length - 1];
      out.push({ c: ' ', s: last.e, e: tok[0].s });
    }
    for (const ch of tok) out.push(ch);
  }
  return out;
}

const text = (cs: Ch[]) => cs.map((x) => x.c).join('');
const spans = (cs: Ch[]): Span[] => cs.map((x) => [x.s, x.e]);

export function normalize(input: string): Normalized {
  const plain = plainChars(input);
  const folded = foldChars(plain);
  const joined = joinSingles(folded);
  return {
    original: input,
    plain: text(plain),
    plainMap: spans(plain),
    folded: text(folded),
    foldedMap: spans(folded),
    joined: text(joined),
    joinedMap: spans(joined),
  };
}

/** Maps [start, end) in a normalized view back to [start, end) in the original text. */
export function toOriginalSpan(map: Span[], start: number, end: number, originalLength: number): Span {
  if (map.length === 0 || start >= map.length) return [0, 0];
  const s = map[Math.max(0, start)][0];
  const e = map[Math.min(map.length, Math.max(start + 1, end)) - 1][1];
  return [Math.min(s, originalLength), Math.min(Math.max(e, s), originalLength)];
}

/**
 * Compiles a rule written in plain lowercase words into a regex over the folded/joined views:
 * applies the same skeleton (l -> i) and repeat-collapse the normalizer applies. Escapes such as
 * \b, \s, \w, \d are untouched. Write words without apostrophes ("youre", "dont").
 */
export function compileWords(source: string): RegExp {
  const skel = source.replace(/(?<!\\)l/g, 'i').replace(/(?<!\\)([a-z])\1+/g, '$1');
  return new RegExp(skel);
}

/** The folded form of a single word or phrase (what the slur hash list is built from). */
export function foldTerm(term: string): string {
  return normalize(term).joined;
}
