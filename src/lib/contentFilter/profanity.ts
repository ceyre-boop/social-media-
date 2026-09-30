/**
 * Swearing: the one thing that separates Family from Standard on its own. A message whose ONLY
 * issue is swearing is shown to Family viewers with the swears masked (***), not hidden.
 *
 * This is a list of swear words, not of feelings. "I'm furious", "this is awful", "I hate this"
 * contain no swear and stay Family. Minced oaths (gosh, heck, darn, frick) are Family too.
 *
 * Words are written plain and compiled with the same skeleton + repeat-collapse the normalizer
 * applies (see normalize.ts). Because of that collapse, short words that would fold into ordinary
 * English ("ass" -> "as", "hell" -> "hei") are only matched inside a phrase, via lookbehind, so the
 * match (and the mask) covers just the swear itself.
 */
import { compileWords, normalize, type Normalized, toOriginalSpan } from './normalize.ts';

const WORDS = [
  String.raw`(?:mother)?fuck\w*`,
  String.raw`fuckin`,
  String.raw`fck\w*`,
  String.raw`fuk(?:ing|in|ed|er|k)?`,
  String.raw`(?:bull|horse|dip)?shit(?:s|ty|ting|ted|head|heads|hole|show|storm|post|posting)?`,
  String.raw`(?:god)?damn(?:it|ed)?`,
  String.raw`(?:god)?dammit`,
  String.raw`crap(?:py|ped)?`,
  String.raw`piss(?:ed|ing|es)?`,
  String.raw`bitch\w*`,
  String.raw`bastards?`,
  String.raw`dick(?:s|head|heads)?`,
  String.raw`(?:dumb|bad|jack|smart|kick)?ass(?:hole|holes|hat|es)`,
  String.raw`(?:dumb|bad|jack|smart)ass`,
  String.raw`arse(?:hole)?`,
  String.raw`bollocks`,
  String.raw`bugger`,
  String.raw`wanker`,
  String.raw`twat`,
  String.raw`cunt\w*`,
  String.raw`wtf`,
  String.raw`stfu`,
  String.raw`gtfo`,
  String.raw`lmfao`,
  String.raw`omfg`,
  String.raw`fml`,
];

/** Swears only matched after a word that makes them expletives. The match is the swear alone. */
const PHRASED = [
  String.raw`(?<=\b(?:kiss\s+my|kick\s+(?:your|ur|my|his|her|their)|my|your|ur|lazy|fat|dumb|pain\s+in\s+the|half)\s+)ass\b`,
  String.raw`(?<=\b(?:what\s+the|the|go\s+to|bloody|as)\s+)hell\b`,
  String.raw`\bhell(?=\s+(?:yes|yeah|no|of\s+a)\b)`,
];

// Built over the raw spellings: "ass" and "hell" must not fold to "as" / "hei" before the
// lookarounds are applied, so the phrased rules are compiled like every other rule.
const SWEAR = compileWords(String.raw`\b(?:${WORDS.join('|')})\b|${PHRASED.join('|')}`);
const SWEAR_G = new RegExp(SWEAR.source, 'g');

export function hasProfanity(n: Normalized): boolean {
  return SWEAR.test(n.folded) || SWEAR.test(n.joined);
}

/** [start, end) spans in the ORIGINAL text of every swear. */
export function profanitySpans(text: string, n: Normalized = normalize(text)): [number, number][] {
  const out: [number, number][] = [];
  for (const view of [
    { t: n.folded, map: n.foldedMap },
    { t: n.joined, map: n.joinedMap },
  ]) {
    SWEAR_G.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SWEAR_G.exec(view.t))) {
      if (m[0].length === 0) {
        SWEAR_G.lastIndex++;
        continue;
      }
      const span = toOriginalSpan(view.map, m.index, m.index + m[0].length, text.length);
      // The fold drops repeated letters ("hell" -> "hel"), so the mapped span can stop short:
      // extend it to the end of the word in the original text.
      while (span[1] < text.length && /[\p{L}\p{N}]/u.test(text[span[1]])) span[1]++;
      if (!out.some(([s, e]) => s < span[1] && span[0] < e)) out.push(span);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Replaces every swear with asterisks of the same length ("what the ****"). */
export function maskProfanity(text: string): string {
  let out = '';
  let at = 0;
  for (const [s, e] of profanitySpans(text)) {
    out += text.slice(at, s) + '*'.repeat(Math.max(3, e - s));
    at = e;
  }
  return out + text.slice(at);
}
