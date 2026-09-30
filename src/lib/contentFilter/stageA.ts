/**
 * content_filter stage A — deterministic rules over normalized text. Target: < 1 ms.
 *
 * Every rule here describes a BEHAVIOUR WITH A TARGET (a person addressed, mentioned, threatened,
 * exposed, or a minor being contacted). There is deliberately no word list for sadness, anger,
 * despair, or profanity on its own: sentiment is never an input (policy "What this policy is not").
 *
 * Rules are written as plain lowercase words and compiled with `compileWords` (see normalize.ts),
 * which applies the same skeleton + repeat-collapse the normalizer applies.
 */
import { plainMessage } from './copy.ts';
import { compileWords as w, normalize, type Normalized, type Span, toOriginalSpan } from './normalize.ts';
import slurHashes from './rules/slurs.hash.json' with { type: 'json' };
import { sha256Hex } from './sha256.ts';
import { type EvalContext, maxTier, type PolicyRef, type Reason, type ReasonCode, type Tier } from './types.ts';

/**
 * Test sentinels (not real words) that are always present in rules/slurs.hash.json so the
 * mechanism is testable without any real slur appearing in the repository in plaintext.
 */
export const SLUR_TEST_SENTINELS = ['zzslurtest', 'qqslurprobe'] as const;

const SLUR_SET: ReadonlySet<string> = new Set((slurHashes as { hashes: string[] }).hashes);

// ------------------------------------------------------------------ vocabulary (plain words)

/** Insults: words that attack a person when aimed at one. Not sentiment words. */
const INSULTS = [
  'idiot', 'idiots', 'moron', 'morons', 'loser', 'losers', 'stupid', 'dumb', 'dumbass', 'retard', 'retarded',
  'ugly', 'fat', 'pig', 'trash', 'garbage', 'clown', 'clowns', 'pathetic', 'worthless', 'useless',
  'disgusting', 'freak', 'creep', 'bitch', 'bastard', 'dick', 'dickhead', 'asshole', 'jerk', 'scum', 'imbecile',
  'cretin', 'rat', 'snake', 'whore', 'slut', 'hoe', 'skank', 'twat', 'cunt', 'prick', 'wanker', 'tool',
  'joke', 'failure', 'waste of space', 'waste of air', 'piece of shit', 'piece of trash', 'monkey', 'ape',
].join('|');

/** Fillers allowed between "you (are)" and the insult: "you absolute clown", "you're such a loser". */
const FILLER = String.raw`(?:(?:such|so|really|truly|a|an|the|fucking|fuckin|fking|damn|biggest|absolute|complete|total|dumb|stupid|ugly|fat|little|big|pathetic|sad|lazy|fake|just|literally|actually|an?)\s+){0,4}`;

/** "you are" and its spellings; plain "you"/"u" for direct address ("you idiot"). */
const YOU_BE = String.raw`(?:you\s+are|youre|you\s+r|u\s+r|u\s+are|ur|are\s+you|are\s+u|your\s+an?|you|u|ya)`;

/** Generic / hypothetical "you" ("when you're useless at work it eats at you") is not a target. */
const GENERIC_YOU = String.raw`(?<!\b(?:when|if|makes|make|made|feel|feels|like|think|thinks|whenever|because|thank|thanks|love|miss)\s+)`;

const NEGATED = String.raw`(?<!\b(?:dont|do\s+not|never|not|wont|please\s+dont|didnt|shouldnt)\s+(?:\w+\s+){0,2})`;

const SECOND_PERSON = String.raw`\b(?:you|u|ur|youre|your|yours|yourself|urself|ya|yall|you\s+guys|thou)\b`;
const THIRD_PERSON = String.raw`\b(?:he|she|him|her|his|hers|they|them|their|theyre|hes|shes|this\s+guy|that\s+guy|this\s+girl|that\s+girl|this\s+dude|that\s+dude|you\s+people|these\s+people|those\s+people)\b`;
const MENTION = /@[a-z0-9_.]+/;

// ------------------------------------------------------------------ rules

type View = 'folded' | 'joined' | 'plain';

type Rule = {
  code: ReasonCode;
  tier: Tier;
  policyRef: PolicyRef;
  rx: RegExp;
  views: View[];
  when?: (ctx: EvalContext) => boolean;
};

const PUBLIC = (ctx: EvalContext) => ctx.surface !== 'dm';
const ADULT_TO_MINOR = (ctx: EvalContext) => ctx.recipientIsMinor === true && ctx.senderIsAdult !== false;
const LEX: View[] = ['folded', 'joined'];

/**
 * Violence verbs only. Game/idiom verbs ("beat you at mario kart", "end you in this game", "find
 * you at the party", "get you a coffee") are deliberately absent.
 */
const THREAT_VERB = String.raw`(?:kill|murder|stab|shoot|hurt|strangle|choke|slit|punch|beat\s+up|beat\s+the\s+shit\s+out\s+of)`;
const THREAT_SUBJ = String.raw`(?:i\s+will|ill|i\s+am\s+going\s+to|im\s+going\s+to|im\s+gonna|i\s+gonna|gonna|imma|ima|i\s+wanna|going\s+to|i\s+shall|we\s+will|were\s+going\s+to|were\s+gonna)`;

const OFF_APPS = String.raw`(?:snap|snapchat|telegram|whatsapp|kik|discord|insta|instagram|ig|wechat|signal|skype|facetime|imessage|number|phone\s+number|cell|email)`;

const SEXUAL_ACT = String.raw`(?:fuck|smash|bang|screw|sleep\s+with|ride|suck|touch|lick|grope)`;

const RULES: Rule[] = [
  // ---------------- RED: self-harm encouragement directed at another person
  {
    code: 'self_harm_encouragement', tier: 'RED', policyRef: 'red.self_harm_encouragement', views: LEX,
    rx: w(String.raw`${NEGATED}\b(?:kill|hang|neck|end|unalive|off|shoot|drown|starve)\s+(?:yourself|urself|yourselves|youself|yoself)\b|${NEGATED}\bkys\b|\bdrink\s+(?:some\s+)?bleach\b|\bgo\s+jump\s+off\b|\bjump\s+off\s+a\s+(?:bridge|building|cliff)\b`),
  },
  // ---------------- RED: credible threats (a threat with specifics) and "I know where you live"
  {
    code: 'credible_threat', tier: 'RED', policyRef: 'red.threat', views: LEX,
    rx: w(String.raw`\bi\s+know\s+where\s+(?:you|u)\s+(?:live|work|sleep|go\s+to\s+school|are|stay)\b|\bim\s+coming\s+(?:to|for)\s+(?:your|ur)\s+(?:house|home|school|work)\b|\bshoot\s+up\s+(?:your|ur|the)\b`),
  },
  // ---------------- ORANGE: threat language at a person (escalated to RED with specifics below)
  {
    code: 'threat_language', tier: 'ORANGE', policyRef: 'red.threat', views: LEX,
    rx: w(String.raw`\b${THREAT_SUBJ}\s+(?:fucking\s+)?${THREAT_VERB}\s+(?:you|u|ur|your)\b(?!\s+(?:a|an|some|the)\b)|\b${THREAT_SUBJ}\s+beat\s+(?:you|u)\s+up\b|\b(?:youre|ur|you\s+are|u\s+r)\s+(?:so\s+)?dead\b(?!\s+to\s+me)|\bwatch\s+(?:your|ur)\s+back\b|\b(?:i\s+will|ill)\s+find\s+(?:you|u)\b(?!\s+(?:at|in|a|an|later|there|after|when|on|some))`),
  },
  // ---------------- ORANGE: wishing death/harm on a person (targeted harassment)
  {
    code: 'death_wish', tier: 'ORANGE', policyRef: 'orange.targeted_harassment', views: LEX,
    rx: w(String.raw`\b(?:i\s+)?hope\s+(?:you|u)\s+(?:die|get\s+cancer|get\s+hit|get\s+killed|rot|suffer|burn)\b(?!\s+(?:laughing|of\s+laughter|happy|old|hard|in\s+your\s+sleep\s+at\s+100))|\b(?:you|u)\s+should\s+(?:just\s+)?die\b|\bgo\s+die\b(?!\s+hard)|\bdie\s+in\s+a\s+(?:fire|hole|ditch)\b|\bi\s+wish\s+(?:you|u)\s+(?:were|was)\s+dead\b|\b(?:world|everyone)\s+would\s+be\s+better\s+(?:off\s+)?without\s+(?:you|u)\b|\bnobody\s+would\s+miss\s+(?:you|u)\b|\bdo\s+(?:us\s+all\s+|everyone\s+)?a\s+favou?r\s+and\s+die\b`),
  },
  // ---------------- ORANGE: inviting others to target a specific person
  {
    code: 'pile_on_invite', tier: 'ORANGE', policyRef: 'orange.pile_on_invite', views: LEX,
    rx: w(String.raw`\b(?:lets|let\s+us|everyone|everybody|all\s+of\s+you|yall|you\s+guys|guys|go|we\s+should|we\s+need\s+to|chat)\s+(?:all\s+)?(?:go\s+)?(?:after|report|mass\s+report|spam|flood|raid|attack|harass|dogpile|brigade|come\s+for|ratio|destroy|cancel|expose|find|dox)\s+(?:@[a-z0-9_.]+|him|her|them|this\s+guy|this\s+girl|his\s+account|her\s+account|their\s+account)`),
  },
  // ---------------- ORANGE: doxxing-adjacent (someone else's location, workplace, school, name)
  {
    code: 'doxxing', tier: 'ORANGE', policyRef: 'orange.doxxing', views: LEX,
    rx: w(String.raw`@[a-z0-9_.]+\s+(?:lives|works|goes\s+to\s+school|is\s+staying|stays)\s+(?:at|on|in|near|by)\b|\b(?:his|her|their|@[a-z0-9_.]+s?)\s+(?:real\s+name|home\s+address|address|school|workplace|phone\s+number|real\s+number)\s+is\b|\b(?:he|she|they)\s+(?:lives|works|goes\s+to\s+school)\s+at\s+\d`),
  },
  // ---------------- ORANGE: sexual comment directed at someone
  {
    code: 'sexual_comment_at_person', tier: 'ORANGE', policyRef: 'orange.sexual_directed', views: LEX,
    rx: w(String.raw`\b(?:send|show)\s+(?:me\s+)?(?:some\s+)?(?:nudes|nude\s+pics|nude|your\s+(?:tits|boobs|dick|body\s+pics))\b|\b(?:i\s+want\s+to|i\s+wanna|wanna|want\s+to|id\s+like\s+to|id|i\s+would|gonna|i\s+will|ill)\s+${SEXUAL_ACT}\s+(?:you|u|@[a-z0-9_.]+|her|him)\b|\bnice\s+(?:tits|boobs)\b|\bsit\s+on\s+my\s+(?:face|dick)\b|\bsuck\s+my\s+dick\b`),
  },
  // ---------------- ORANGE (public surfaces): phone numbers and street addresses
  {
    code: 'personal_info', tier: 'ORANGE', policyRef: 'orange.doxxing', views: ['plain'], when: PUBLIC,
    rx: /(?:\+?\d[\d\s().-]{8,}\d)|\b\d{1,5}\s+(?:[a-z][a-z.'-]*\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|circle|crescent)\b/,
  },
  // ---------------- minor safety: only with a known minor recipient and a (possibly) adult sender
  {
    code: 'off_platform_minor', tier: 'RED', policyRef: 'red.minor_off_platform', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\b(?:add|hmu|dm|message|text|call|find|follow|hit|msg|talk\s+to)\s+(?:me\s+)?(?:up\s+)?(?:on|at|in|over)\s+${OFF_APPS}\b|\b(?:whats|what\s+is|give\s+me|send\s+me|drop|tell\s+me)\s+(?:your|ur|you)\s+${OFF_APPS}\b|\b(?:my|heres\s+my|here\s+is\s+my)\s+${OFF_APPS}\b|\btext\s+me\b|\bcall\s+me\b|\b(?:lets|we\s+should|wanna|want\s+to|can\s+we)\s+(?:meet|meet\s+up|hang\s+out)\b`),
  },
  {
    code: 'off_platform_minor', tier: 'RED', policyRef: 'red.minor_off_platform', views: ['plain'], when: ADULT_TO_MINOR,
    rx: /(?:\+?\d[\d\s().-]{8,}\d)/,
  },
  {
    code: 'secrecy_minor', tier: 'RED', policyRef: 'red.minor_off_platform', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\bdont\s+tell\s+(?:your\s+|ur\s+)?(?:mom|mum|dad|parents|anyone|anybody|family|teacher)\b|\b(?:our|a)\s+(?:little\s+)?secret\b|\b(?:are|r)\s+(?:you|u)\s+(?:home\s+)?alone\b|\bdelete\s+(?:this|these|our|the)\s+(?:messages|chat|convo|conversation|dms)\b|\bis\s+anyone\s+(?:home|watching)\b`),
  },
  {
    code: 'sexual_minor', tier: 'RED', policyRef: 'red.minor_sexual', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\b(?:send|show)\s+(?:me\s+)?(?:some\s+)?(?:nudes|nude|pics|pictures|photos|a\s+pic|your\s+body)\b|\b(?:sexy|hot\s+body|what\s+are\s+you\s+wearing|kiss\s+you|touch\s+you|nudes|naked)\b|\b${SEXUAL_ACT}\s+(?:you|u)\b`),
  },
  {
    code: 'age_question_minor', tier: 'ORANGE', policyRef: 'orange.minor_age_question', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\bhow\s+old\s+(?:are|r)\s+(?:you|u)\b|\bwhat\s+grade\s+(?:are|r)\s+(?:you|u)\s+in\b|\b(?:are|r)\s+(?:you|u)\s+(?:over\s+|under\s+)?(?:18|eighteen|a\s+minor|in\s+(?:high|middle)\s+school)\b|\basl\b|\bwhats\s+your\s+age\b|\bhow\s+young\b`),
  },
  // ---------------- YELLOW: insults and contempt aimed at a person
  {
    code: 'insult_at_person', tier: 'YELLOW', policyRef: 'yellow.insult', views: LEX,
    rx: w(String.raw`${GENERIC_YOU}\b${YOU_BE}\s+${FILLER}(?:${INSULTS})\b|@[a-z0-9_.]+\s+(?:is|is\s+such|is\s+so|=)\s+${FILLER}(?:${INSULTS})\b|\b(?:nobody|no\s+one|noone|everyone|everybody)\s+(?:likes|hates|wants|cares\s+about|loves)\s+(?:you|u)\b|\b(?:you|u)\s+(?:disgust|sicken)\s+me\b`),
  },
  {
    code: 'profanity_at_person', tier: 'YELLOW', policyRef: 'yellow.insult', views: LEX,
    rx: w(String.raw`\b(?:fuck|screw|fk|fck|fuk|frick)\s+(?:you|u|off|yourself|urself)\b(?!\s+(?:cancer|monday|mondays|traffic|covid|depression|anxiety|life|capitalism|winter|rent|this|that)\b)|\b(?:stfu|gtfo|foad)\b`),
  },
];

/** A person reference nearby + an insult word: GREEN normally, promoted to YELLOW under Protected. */
const MILD_INSULT = w(String.raw`(?:${THIRD_PERSON}|@[a-z0-9_.]+)(?:\s+\S+){0,3}?\s+(?:${INSULTS})\b`);
const SELF_BEFORE = w(String.raw`\b(?:i|im|ive|me|myself|feel|feeling)\b`);

/** Specifics that turn threat language into a credible threat. */
const SPECIFICS = w(String.raw`\b(?:stab|shoot|murder|strangle|gun|knife|bat|bomb|machete|tonight|tomorrow|after\s+school|at\s+your\s+(?:house|home|school|work)|where\s+you\s+live|your\s+address|outside\s+your)\b`);

const TARGET_RX = [w(SECOND_PERSON), w(THIRD_PERSON)];

// ------------------------------------------------------------------ evaluation

export type StageAResult = {
  tier: Tier;
  reasons: Reason[];
  /** A person is addressed, mentioned, or referred to. Stage B only runs when true. */
  hasTarget: boolean;
  /** Protected-strictness signal (GREEN otherwise). Never produced for self-directed text. */
  mildInsult: Reason | null;
  normalized: Normalized;
};

export function hasTarget(n: Normalized): boolean {
  if (MENTION.test(n.folded)) return true;
  for (const rx of TARGET_RX) if (rx.test(n.folded) || rx.test(n.joined)) return true;
  return false;
}

function viewOf(n: Normalized, v: View): { text: string; map: Span[] } {
  if (v === 'plain') return { text: n.plain, map: n.plainMap };
  if (v === 'joined') return { text: n.joined, map: n.joinedMap };
  return { text: n.folded, map: n.foldedMap };
}

function reason(code: ReasonCode, tier: Tier, policyRef: PolicyRef, span: Span): Reason {
  return { code, tier, span, plainMessage: plainMessage(code), policyRef, stage: 'A' };
}

function slurReasons(n: Normalized, target: boolean): Reason | null {
  for (const v of ['folded', 'joined'] as const) {
    const { text, map } = viewOf(n, v);
    const toks: { t: string; s: number; e: number }[] = [];
    const rx = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) toks.push({ t: m[0], s: m.index, e: m.index + m[0].length });
    for (let i = 0; i < toks.length; i++) {
      const cands = [toks[i]];
      if (i + 1 < toks.length) cands.push({ t: `${toks[i].t} ${toks[i + 1].t}`, s: toks[i].s, e: toks[i + 1].e });
      for (const c of cands) {
        if (SLUR_SET.has(sha256Hex(c.t))) {
          const span = toOriginalSpan(map, c.s, c.e, n.original.length);
          return target
            ? reason('slur_attack', 'ORANGE', 'orange.slur_attack', span)
            : reason('slur', 'YELLOW', 'orange.slur_attack', span);
        }
      }
    }
  }
  return null;
}

export function stageA(text: string, ctx: EvalContext): StageAResult {
  const n = normalize(text);
  const reasons: Reason[] = [];
  const seen = new Set<ReasonCode>();

  for (const rule of RULES) {
    if (seen.has(rule.code)) continue;
    if (rule.when && !rule.when(ctx)) continue;
    for (const v of rule.views) {
      const { text: t, map } = viewOf(n, v);
      const m = rule.rx.exec(t);
      if (m) {
        const span = toOriginalSpan(map, m.index, m.index + m[0].length, text.length);
        reasons.push(reason(rule.code, rule.tier, rule.policyRef, span));
        seen.add(rule.code);
        break;
      }
    }
  }

  // Threat language with specifics (weapon, time, place) is a credible threat.
  if (seen.has('threat_language') && !seen.has('credible_threat') && (SPECIFICS.test(n.folded) || SPECIFICS.test(n.joined))) {
    const base = reasons.find((r) => r.code === 'threat_language');
    if (base) reasons.push(reason('credible_threat', 'RED', 'red.threat', base.span));
  }

  const target = hasTarget(n);
  const slur = slurReasons(n, target);
  if (slur) reasons.push(slur);

  let tier: Tier = 'GREEN';
  for (const r of reasons) tier = maxTier(tier, r.tier);
  reasons.sort((a, b) => rank(b.tier) - rank(a.tier));

  let mildInsult: Reason | null = null;
  if (tier === 'GREEN') {
    for (const v of ['folded', 'joined'] as const) {
      const { text: t, map } = viewOf(n, v);
      const m = MILD_INSULT.exec(t);
      if (!m) continue;
      const before = t.slice(Math.max(0, m.index - 40), m.index + m[0].length);
      if (SELF_BEFORE.test(before)) continue;
      mildInsult = reason('mild_insult', 'YELLOW', 'yellow.protected_mild_insult', toOriginalSpan(map, m.index, m.index + m[0].length, text.length));
      break;
    }
  }

  return { tier, reasons, hasTarget: target, mildInsult, normalized: n };
}

function rank(t: Tier) {
  return t === 'RED' ? 3 : t === 'ORANGE' ? 2 : t === 'YELLOW' ? 1 : 0;
}
