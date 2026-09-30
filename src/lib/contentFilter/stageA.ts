/**
 * content_filter stage A — deterministic rules over normalized text. Target: < 1 ms.
 *
 * Output is a GRADE (see types.ts): the lowest level a message may be shown at, or the ceiling.
 *
 *   family    nothing below matched
 *   standard  swearing; a mild insult (idiot, clown, "fuck you") at or about a person
 *   open      roasting (harsh insults, mockery of how someone looks); crude jokes
 *   max       edgy / dark jokes; an in-group slur not aimed at anyone
 *   orange    ceiling: bullying, harassing, controlling, slur at a person, sexual content,
 *             pile-ons, doxxing, threat language, a minor's age asked by an adult
 *   red       ceiling: credible threats, self-harm encouragement, moving a minor into private
 *             contact, anything sexual toward a minor
 *
 * Every insult / ceiling rule describes a BEHAVIOUR (usually with a target). There is deliberately
 * no word list for sadness, anger, despair, or grief: sentiment is never an input. Swearing is
 * matched as swearing (profanity.ts), never as a mood.
 *
 * Rules are written as plain lowercase words and compiled with `compileWords` (see normalize.ts),
 * which applies the same skeleton + repeat-collapse the normalizer applies.
 */
import { plainMessage } from './copy.ts';
import { compileWords as w, normalize, type Normalized, type Span, toOriginalSpan } from './normalize.ts';
import { hasProfanity, profanitySpans } from './profanity.ts';
import slurHashes from './rules/slurs.hash.json' with { type: 'json' };
import { sha256Hex } from './sha256.ts';
import { type EvalContext, type Grade, GRADE_RANK, maxGrade, type PolicyRef, type Reason, type ReasonCode } from './types.ts';

/**
 * Test sentinels (not real words) that are always present in rules/slurs.hash.json so the
 * mechanism is testable without any real slur appearing in the repository in plaintext.
 */
export const SLUR_TEST_SENTINELS = ['zzslurtest', 'qqslurprobe'] as const;

const SLUR_SET: ReadonlySet<string> = new Set((slurHashes as { hashes: string[] }).hashes);

// ------------------------------------------------------------------ vocabulary (plain words)

/** Mild insults: Standard. Trash talk a friend would shrug off. */
const MILD = [
  'idiot', 'idiots', 'moron', 'morons', 'stupid', 'dumb', 'clown', 'clowns', 'jerk', 'tool', 'joke',
  'trash', 'garbage', 'noob', 'dork', 'fool', 'dummy', 'imbecile', 'cretin', 'fraud', 'bozo', 'muppet',
  'weirdo', 'annoying', 'cringe', 'bot',
].join('|');

/** Harsh insults and looks-mockery: a roast (Open) between friends, bullying from a stranger. */
const HARSH = [
  'loser', 'losers', 'pathetic', 'worthless', 'useless', 'disgusting', 'ugly', 'fat', 'pig', 'freak',
  'creep', 'scum', 'failure', 'waste of space', 'waste of air', 'piece of shit', 'piece of trash',
  'dumbass', 'dickhead', 'asshole', 'bitch', 'bastard', 'dick', 'prick', 'twat', 'cunt', 'wanker',
  'whore', 'slut', 'hoe', 'skank', 'retard', 'retarded', 'rat', 'snake', 'monkey', 'ape',
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
const PERSON = String.raw`(?:@[a-z0-9_.]+|him|her|them|this\s+guy|this\s+girl|this\s+dude|his|their)`;

const insultAt = (list: string) =>
  w(String.raw`${GENERIC_YOU}\b${YOU_BE}\s+${FILLER}(?:${list})\b|@[a-z0-9_.]+\s+(?:is|is\s+such|is\s+so|=)\s+${FILLER}(?:${list})\b|\bwhat\s+an?\s+${FILLER}(?:${list})\s+(?:you\s+are|u\s+are|youre|ur)\b`);

// ------------------------------------------------------------------ rules

type View = 'folded' | 'joined' | 'plain';

type Rule = {
  code: ReasonCode;
  grade: Grade;
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

/** "I'll", "I will", "I'm going to", "I swear I'll". */
const I_WILL = String.raw`(?:ill|i\s+will|im\s+going\s+to|im\s+gonna|i\s+swear\s+ill|i\s+am\s+going\s+to)`;

/** A short bounded gap of words (folded views have no punctuation). */
const GAP = (n: number) => String.raw`(?:\s+\S+){0,${n}}?`;

const RULES: Rule[] = [
  // ---------------- RED: self-harm encouragement directed at another person
  {
    code: 'self_harm_encouragement', grade: 'red', policyRef: 'red.self_harm_encouragement', views: LEX,
    rx: w(String.raw`${NEGATED}\b(?:kill|hang|neck|end|unalive|off|shoot|drown|starve)\s+(?:yourself|urself|yourselves|youself|yoself)\b|${NEGATED}\bkys\b|\bdrink\s+(?:some\s+)?bleach\b|\bgo\s+jump\s+off\b|\bjump\s+off\s+a\s+(?:bridge|building|cliff)\b|\bcut\s+deeper\b`),
  },
  // ---------------- RED: credible threats (a threat with specifics) and "I know where you live"
  {
    code: 'credible_threat', grade: 'red', policyRef: 'red.threat', views: LEX,
    rx: w(String.raw`\bi\s+know\s+where\s+(?:you|u)\s+(?:live|work|sleep|go\s+to\s+school|are|stay)\b|\bim\s+coming\s+(?:to|for)\s+(?:your|ur)\s+(?:house|home|school|work)\b|\bshoot\s+up\s+(?:your|ur|the)\b`),
  },
  // ---------------- ORANGE: threat language at a person (escalated to RED with specifics below)
  {
    code: 'threat_language', grade: 'orange', policyRef: 'orange.threat', views: LEX,
    rx: w(String.raw`\b${THREAT_SUBJ}\s+(?:fucking\s+)?${THREAT_VERB}\s+(?:you|u|ur|your)\b(?!\s+(?:a|an|some|the)\b)|\b${THREAT_SUBJ}\s+beat\s+(?:you|u)\s+up\b|\b(?:youre|ur|you\s+are|u\s+r)\s+(?:so\s+)?dead\b(?!\s+to\s+me)|\bwatch\s+(?:your|ur)\s+back\b|\b(?:i\s+will|ill)\s+find\s+(?:you|u)\b(?!\s+(?:at|in|a|an|later|there|after|when|on|some))`),
  },
  // ---------------- ORANGE harassing: wishing death/harm on a person
  {
    code: 'death_wish', grade: 'orange', policyRef: 'orange.harassing', views: LEX,
    rx: w(String.raw`\b(?:i\s+)?hope\s+(?:you|u)\s+(?:die|get\s+cancer|get\s+hit|get\s+killed|rot|suffer|burn)\b(?!\s+(?:laughing|of\s+laughter|happy|old|hard|in\s+your\s+sleep\s+at\s+100))|\b(?:you|u)\s+should\s+(?:just\s+)?die\b|\bgo\s+die\b(?!\s+hard)|\bdie\s+in\s+a\s+(?:fire|hole|ditch)\b|\bi\s+wish\s+(?:you|u)\s+(?:were|was)\s+dead\b|\b(?:world|everyone)\s+would\s+be\s+better\s+(?:off\s+)?without\s+(?:you|u)\b|\bnobody\s+would\s+miss\s+(?:you|u)\b|\bdo\s+(?:us\s+all\s+|everyone\s+)?a\s+favou?r\s+and\s+die\b|\b(?:you|u)\s+dont\s+deserve\s+to\s+(?:live|exist)\b`),
  },
  // ---------------- ORANGE harassing: persistent unwanted contact, said out loud
  {
    code: 'harassing', grade: 'orange', policyRef: 'orange.harassing', views: LEX,
    rx: w(String.raw`\b(?:ill|i\s+will|im\s+going\s+to|im\s+gonna|im\s+not\s+going\s+to\s+stop|i\s+wont\s+stop|im\s+not\s+gonna\s+stop)${GAP(3)}\s+(?:keep\s+)?(?:messaging|message|texting|text|calling|call|commenting|comment|dming|dm|following|follow|posting|coming)${GAP(6)}\s+until\s+(?:you|u)\b|\b(?:youll|you\s+will|u\s+will)\s+never\s+be\s+safe\b|\bnot\s+(?:going\s+to|gonna)\s+stop\s+until\s+(?:you|u)\b|\bmake\s+(?:your|ur)\s+life\s+(?:hell|a\s+living\s+hell|miserable)\b|\b(?:you|u)\s+cant\s+hide\s+from\s+me\b|\b(?:made|make|making)\s+(?:another|a\s+new|new)\s+accounts?\s+(?:since|because|cause|cuz|coz)\s+(?:you|u)\s+blocked\s+me\b|\bblock\s+me\s+all\s+(?:you|u)\s+want\b|\b(?:ill|i\s+will)\s+(?:be\s+in|follow\s+you\s+to|show\s+up\s+(?:in|at))\s+every\s+(?:one\s+of\s+(?:your|ur)\s+)?(?:stream|streams|live|lives|post|posts)\b|\b(?:ive|i\s+have)\s+messaged\s+(?:you|u)\s+\d+\s+times\b|\banswer\s+me${GAP(1)}\s+answer\s+me\b`),
  },
  // ---------------- ORANGE controlling / coercion
  {
    code: 'controlling', grade: 'orange', policyRef: 'orange.controlling', views: LEX,
    rx: w([
      // "you're not allowed to talk to / see / go / post ..." (not "leave": "not allowed to leave without cake")
      String.raw`\b(?:youre|you\s+are|ur|u\s+r|u\s+are)\s+not\s+allowed\s+to\s+(?:talk|see|hang|go\s+out|go\s+to|text|message|meet|post|wear|call|follow|speak|be\s+friends|have\s+friends)\b`,
      String.raw`\bi\s+(?:dont|wont|do\s+not|will\s+not)\s+(?:allow|let)\s+(?:you|u)\s+(?:to\s+)?(?:talk|see|hang|go\s+out|text|message|meet|post|wear|be\s+friends)\b`,
      String.raw`\bi\s+forbid\s+(?:you|u)\b`,
      // isolation from friends / family
      String.raw`\b(?:stop|quit)\s+(?:talking\s+to|seeing|hanging\s+out\s+with|texting)\s+(?:your|ur)\s+(?:friends|family|mom|mum|dad|sister|brother|parents)\b`,
      String.raw`\bi\s+dont\s+want\s+(?:you|u)\s+(?:talking|hanging\s+out|texting)\s+(?:to|with)\s+(?:your|ur|any\s+of\s+your)\s+(?:friends|family)\b`,
      String.raw`\b(?:block|unfollow|unadd|delete|dump|drop|cut\s+off)\s+(?:him|her|them|your\s+friends|ur\s+friends)\s+or\s+(?:else|im|i\s+am|ill|i\s+will|were|we\s+are)\b`,
      // monitoring: passwords, phones, location on demand
      String.raw`\b(?:give|send|tell)\s+me\s+(?:your|ur)\s+(?:password|passwords|passcode|login|pin|phone\s+password)\b`,
      String.raw`\blet\s+me\s+(?:see|check|go\s+through|look\s+through)\s+(?:your|ur)\s+(?:phone|messages|dms|texts|chats)\b`,
      String.raw`\b(?:share|send|turn\s+on)\s+(?:me\s+)?(?:your|ur)\s+(?:live\s+)?location${GAP(4)}\s+(?:or\s+(?:else|dont|im|ill|were|you)|at\s+all\s+times|every\s+time)\b`,
      String.raw`\btell\s+me\s+where\s+(?:you|u)\s+(?:are|r|were)${GAP(3)}\s+or\s+(?:else|were\s+done|we\s+are\s+done|im|ill)\b`,
      String.raw`\bi\s+need\s+to\s+know\s+where\s+(?:you|u)\s+(?:are|r)\s+at\s+all\s+times\b`,
      String.raw`\b(?:you|u)\s+(?:have|need|got)\s+to\s+(?:ask|tell)\s+me\s+(?:before|whenever|every\s+time)\s+(?:you|u)\s+(?:go|leave|post|talk|see)\b`,
      String.raw`\b(?:why|answer|reply)${GAP(6)}\s+i\s+can\s+see\s+(?:you|u)(?:re|\s+are|\s+r)?\s+online\b|\bi\s+can\s+see\s+(?:you|u)(?:re|\s+are|\s+r)?\s+online${GAP(4)}\s+(?:answer|reply|respond)\b`,
      // threats of consequences as leverage
      String.raw`\bif\s+(?:you|u)\s+(?:go|leave|dont|do\s+not|talk|see|block|ignore|post|break\s+up|say\s+no)${GAP(6)}\s+${I_WILL}\s+(?:tell\s+(?:everyone|people|your|ur)|post|expose|share|send\s+(?:them|those|your)|leak|ruin|hurt\s+myself|kill\s+myself)\b`,
      String.raw`\b(?:do\s+it|delete\s+(?:your|ur)\s+account|say\s+yes|come\s+over)\s+or\s+${I_WILL}\s+(?:tell|post|expose|share|leak|ruin)\b`,
      // guilt as leverage
      String.raw`\bafter\s+(?:everything|all)\s+(?:ive|i\s+have|i)\s+(?:done|did)\s+for\s+(?:you|u)${GAP(4)}\s+(?:you\s+owe|youll\s+do|you\s+will\s+do|do\s+what\s+i\s+say|you\s+cant|this\s+is\s+how)\b`,
      String.raw`\b(?:you|u)\s+owe\s+me${GAP(3)}\s+(?:so\s+)?(?:do\s+what\s+i\s+say|youll\s+do|you\s+will\s+do)\b`,
    ].join('|')),
  },
  // ---------------- ORANGE bullying: demeaning a person, or who they are
  {
    code: 'bullying', grade: 'orange', policyRef: 'orange.bullying', views: LEX,
    rx: w([
      String.raw`\b(?:nobody|no\s+one|noone)\s+(?:here\s+|at\s+school\s+)?(?:likes|wants|cares\s+about|loves|wants\s+to\s+see)\s+(?:you|u)\b`,
      String.raw`\b(?:everyone|everybody|we\s+all|the\s+whole\s+school)\s+(?:hates|is\s+laughing\s+at|laughs\s+at)\s+(?:you|u)\b`,
      String.raw`\b(?:you|u)\s+should\s+(?:just\s+)?(?:leave|quit|get\s+off)\s+(?:the\s+internet|this\s+app|streaming|social\s+media|school)\b`,
      String.raw`\bnobody\s+wants\s+(?:you|u)\s+here\b`,
      String.raw`\brate\s+how\s+(?:ugly|fat|stupid|gross)\s+(?:she|he|they|@[a-z0-9_.]+)\s+(?:is|are)\b`,
    ].join('|')),
  },
  // ---------------- ORANGE identity attack: attacking someone for who they are
  {
    code: 'bullying', grade: 'orange', policyRef: 'orange.identity_attack', views: LEX,
    rx: w(String.raw`\bgo\s+back\s+to\s+(?:your|ur)\s+(?:own\s+)?(?:country|continent)\b|\bpeople\s+like\s+(?:you|u)\s+(?:shouldnt|should\s+not|dont\s+deserve|dont\s+belong|arent\s+allowed)\b|\byour\s+kind\s+(?:ruins?|should|doesnt|dont|always|are\s+(?:animals|disgusting|the\s+problem|ruining))\b`),
  },
  // ---------------- ORANGE bullying: inviting others to go after (or laugh at) a specific person
  {
    code: 'pile_on_invite', grade: 'orange', policyRef: 'orange.pile_on_invite', views: LEX,
    rx: w(String.raw`\b(?:lets|let\s+us|everyone|everybody|all\s+of\s+you|yall|you\s+guys|guys|go|we\s+should|we\s+need\s+to|chat)\s+(?:all\s+)?(?:go\s+)?(?:after|report|mass\s+report|spam|flood|raid|attack|harass|dogpile|brigade|come\s+for|ratio|destroy|cancel|expose|find|dox|make\s+fun\s+of)\s+${PERSON}`),
  },
  // ---------------- ORANGE: doxxing-adjacent (someone else's location, workplace, school, name)
  {
    code: 'doxxing', grade: 'orange', policyRef: 'orange.doxxing', views: LEX,
    rx: w(String.raw`@[a-z0-9_.]+\s+(?:lives|works|goes\s+to\s+school|is\s+staying|stays)\s+(?:at|on|in|near|by)\b|\b(?:his|her|their|@[a-z0-9_.]+s?)\s+(?:real\s+name|home\s+address|address|school|workplace|phone\s+number|real\s+number)\s+is\b|\b(?:he|she|they)\s+(?:lives|works|goes\s+to\s+school)\s+at\s+\d`),
  },
  // ---------------- ORANGE sexual: aimed at someone
  {
    code: 'sexual_comment_at_person', grade: 'orange', policyRef: 'orange.sexual', views: LEX,
    rx: w(String.raw`\b(?:send|show)\s+(?:me\s+)?(?:some\s+)?(?:nudes|nude\s+pics|nude|your\s+(?:tits|boobs|dick|body\s+pics))\b|\b(?:i\s+want\s+to|i\s+wanna|wanna|want\s+to|id\s+like\s+to|id|i\s+would|gonna|i\s+will|ill)\s+${SEXUAL_ACT}\s+(?:you|u|@[a-z0-9_.]+|her|him)\b|\bnice\s+(?:tits|boobs)\b|\bsit\s+on\s+my\s+(?:face|dick)\b|\bsuck\s+my\s+(?:dick|cock)\b|\btake\s+(?:your|ur)\s+(?:shirt|top|clothes|pants|bra)\s+off\b|\bid\s+(?:hit|tap)\s+that\b|\b(?:see|seeing)\s+(?:you|u)\s+naked\b`),
  },
  // ---------------- ORANGE sexual: explicit content, aimed at nobody (out at every level)
  {
    code: 'sexual_content', grade: 'orange', policyRef: 'orange.sexual', views: LEX,
    rx: w(String.raw`\b(?:horny|blowjobs?|blow\s+jobs?|handjobs?|hand\s+jobs?|cumshots?|sexting|sext|nudes|dickpics?|dick\s+pics?|titties|jerk\s+off|jerking\s+off|jack\s+off|jacking\s+off)\b`),
  },
  // ---------------- ORANGE (public surfaces): phone numbers and street addresses
  {
    code: 'personal_info', grade: 'orange', policyRef: 'orange.doxxing', views: ['plain'], when: PUBLIC,
    rx: /(?:\+?\d[\d\s().-]{8,}\d)|\b\d{1,5}\s+(?:[a-z][a-z.'-]*\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|circle|crescent)\b/,
  },
  // ---------------- minor safety: only with a known minor recipient and a (possibly) adult sender
  {
    code: 'off_platform_minor', grade: 'red', policyRef: 'red.minor_off_platform', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\b(?:add|hmu|dm|message|text|call|find|follow|hit|msg|talk\s+to)\s+(?:me\s+)?(?:up\s+)?(?:on|at|in|over)\s+${OFF_APPS}\b|\b(?:whats|what\s+is|give\s+me|send\s+me|drop|tell\s+me)\s+(?:your|ur|you)\s+${OFF_APPS}\b|\b(?:my|heres\s+my|here\s+is\s+my)\s+${OFF_APPS}\b|\btext\s+me\b|\bcall\s+me\b|\b(?:lets|we\s+should|wanna|want\s+to|can\s+we)\s+(?:meet|meet\s+up|hang\s+out)\b`),
  },
  {
    code: 'off_platform_minor', grade: 'red', policyRef: 'red.minor_off_platform', views: ['plain'], when: ADULT_TO_MINOR,
    rx: /(?:\+?\d[\d\s().-]{8,}\d)/,
  },
  {
    code: 'secrecy_minor', grade: 'red', policyRef: 'red.minor_off_platform', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\bdont\s+tell\s+(?:your\s+|ur\s+)?(?:mom|mum|dad|parents|anyone|anybody|family|teacher)\b|\b(?:our|a)\s+(?:little\s+)?secret\b|\b(?:are|r)\s+(?:you|u)\s+(?:home\s+)?alone\b|\bdelete\s+(?:this|these|our|the)\s+(?:messages|chat|convo|conversation|dms)\b|\bis\s+anyone\s+(?:home|watching)\b`),
  },
  {
    code: 'sexual_minor', grade: 'red', policyRef: 'red.minor_sexual', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\b(?:send|show)\s+(?:me\s+)?(?:some\s+)?(?:nudes|nude|pics|pictures|photos|a\s+pic|your\s+body)\b|\b(?:sexy|hot\s+body|what\s+are\s+you\s+wearing|kiss\s+you|touch\s+you|nudes|naked|horny)\b|\b${SEXUAL_ACT}\s+(?:you|u)\b`),
  },
  {
    code: 'age_question_minor', grade: 'orange', policyRef: 'orange.minor_age_question', views: LEX, when: ADULT_TO_MINOR,
    rx: w(String.raw`\bhow\s+old\s+(?:are|r)\s+(?:you|u)\b|\bwhat\s+grade\s+(?:are|r)\s+(?:you|u)\s+in\b|\b(?:are|r)\s+(?:you|u)\s+(?:over\s+|under\s+)?(?:18|eighteen|a\s+minor|in\s+(?:high|middle)\s+school)\b|\basl\b|\bwhats\s+your\s+age\b|\bhow\s+young\b`),
  },
  // ---------------- OPEN: a roast aimed at the person addressed (bullying from a stranger)
  {
    code: 'roast', grade: 'open', policyRef: 'open.roast', views: LEX,
    rx: insultAt(HARSH),
  },
  {
    code: 'roast', grade: 'open', policyRef: 'open.roast', views: LEX,
    rx: w(String.raw`\b(?:your|ur)\s+(?:face|nose|teeth|voice|forehead|body|hair|lisp|stutter|accent|laugh|head)\s+(?:is|are|looks|sounds)\s+(?:so\s+|really\s+|super\s+)?(?:ugly|huge|gross|disgusting|annoying|weird|busted|hideous|crooked|nasty|painful)\b|\b(?:you|u)\s+look\s+like\s+(?:a|an)\s+(?:thumb|potato|troll|goblin|rat|pig|foot|egg|lost\s+\w+)\b`),
  },
  // ---------------- OPEN: crude jokes (Family keeps these out; nobody is targeted)
  {
    code: 'crude_humor', grade: 'open', policyRef: 'open.crude', views: LEX,
    rx: w(String.raw`\b(?:fart|farts|farted|farting|turd|turds|butthole|boogers?|boner|boners|queef\w*|diarrhea\s+jokes?)\b|\bthats\s+what\s+she\s+said\b|\b(?:in|to)\s+the\s+(?:balls|nuts|crotch)\b|\b(?:take|taking|took)\s+a\s+(?:dump|massive\s+dump)\b|\bpeed\s+(?:my|his|her|their)\s+pants\b`),
  },
  // The fold collapses "poop" to "pop", so it is matched on the plain view.
  { code: 'crude_humor', grade: 'open', policyRef: 'open.crude', views: ['plain'], rx: /\bpoo+p(?:s|ed|ing|y)?\b/ },
  // ---------------- MAX: edgy / dark jokes (heavy subjects played for laughs)
  {
    code: 'dark_humor', grade: 'max', policyRef: 'max.dark_humor', views: LEX,
    rx: w(String.raw`\bdead\s+baby\s+jokes?\b|\b(?:tell|telling|told|heres|here\s+is|got)\s+(?:a|an|my|another)\s+(?:holocaust|9\s*11|cancer|suicide|dead\s+baby|school\s+shooting)\s+joke\b|\bi\s+have\s+a\s+joke\s+about\s+cancer\b`),
  },
  // ---------------- STANDARD: a mild insult aimed at the person addressed (YELLOW mirror)
  {
    code: 'insult_at_person', grade: 'standard', policyRef: 'standard.insult', views: LEX,
    rx: insultAt(MILD),
  },
  {
    code: 'insult_at_person', grade: 'standard', policyRef: 'standard.insult', views: LEX,
    rx: w(String.raw`\b(?:fuck|screw|fk|fck|fuk|frick)\s+(?:you|u|off|yourself|urself)\b(?!\s+(?:cancer|monday|mondays|traffic|covid|depression|anxiety|life|capitalism|winter|rent|this|that)\b)|\b(?:stfu|gtfo|foad)\b|\bshut\s+(?:your|ur)\s+(?:mouth|face|trap)\b|\b(?:you|u)\s+(?:suck|disgust\s+me|sicken\s+me)\b|\bnobody\s+asked\s+(?:you|u)\b|\b(?:you|u)\s+have\s+the\s+brain\s+of\s+a\b`),
  },
];

/** A person reference nearby + an insult word ("he is such an idiot"): about someone, not to them. */
const aboutPerson = (list: string) =>
  w(String.raw`(?:${THIRD_PERSON}|@[a-z0-9_.]+)(?:\s+\S+){0,3}?\s+(?:${list})\b`);
const ABOUT_MILD = aboutPerson(MILD);
const ABOUT_HARSH = aboutPerson(HARSH);
const SELF_BEFORE = w(String.raw`\b(?:i|im|ive|me|myself|feel|feeling)\b`);

/** Specifics that turn threat language into a credible threat. */
const SPECIFICS = w(String.raw`\b(?:stab|shoot|murder|strangle|gun|knife|bat|bomb|machete|tonight|tomorrow|after\s+school|at\s+your\s+(?:house|home|school|work)|where\s+you\s+live|your\s+address|outside\s+your)\b`);

const ADDRESSED_RX = [w(SECOND_PERSON)];
const THIRD_RX = [w(THIRD_PERSON)];

// ------------------------------------------------------------------ evaluation

export type StageAResult = {
  grade: Grade;
  reasons: Reason[];
  /** A person is addressed, mentioned, or referred to. Stage B only runs when true. */
  hasTarget: boolean;
  /** The message speaks TO someone (second person or @mention): relationship context applies. */
  addressed: boolean;
  normalized: Normalized;
};

function test(n: Normalized, rxs: RegExp[]): boolean {
  for (const rx of rxs) if (rx.test(n.folded) || rx.test(n.joined)) return true;
  return false;
}

export function isAddressed(n: Normalized): boolean {
  return MENTION.test(n.folded) || test(n, ADDRESSED_RX);
}

export function hasTarget(n: Normalized): boolean {
  return isAddressed(n) || test(n, THIRD_RX);
}

function viewOf(n: Normalized, v: View): { text: string; map: Span[] } {
  if (v === 'plain') return { text: n.plain, map: n.plainMap };
  if (v === 'joined') return { text: n.joined, map: n.joinedMap };
  return { text: n.folded, map: n.foldedMap };
}

function reason(code: ReasonCode, grade: Grade, policyRef: PolicyRef, span: Span): Reason {
  return { code, grade, span, plainMessage: plainMessage(code), policyRef, stage: 'A' };
}

function slurReason(n: Normalized, target: boolean): Reason | null {
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
            ? reason('slur_attack', 'orange', 'orange.slur_attack', span)
            : reason('slur', 'max', 'max.slur_untargeted', span);
        }
      }
    }
  }
  return null;
}

function aboutReason(n: Normalized): Reason | null {
  for (const [rx, grade, ref] of [
    [ABOUT_HARSH, 'open', 'open.roast'],
    [ABOUT_MILD, 'standard', 'standard.insult'],
  ] as const) {
    for (const v of ['folded', 'joined'] as const) {
      const { text: t, map } = viewOf(n, v);
      const m = rx.exec(t);
      if (!m) continue;
      const before = t.slice(Math.max(0, m.index - 40), m.index + m[0].length);
      if (SELF_BEFORE.test(before)) continue;
      return reason('insult_about_person', grade, ref, toOriginalSpan(map, m.index, m.index + m[0].length, n.original.length));
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
        reasons.push(reason(rule.code, rule.grade, rule.policyRef, span));
        seen.add(rule.code);
        break;
      }
    }
  }

  // Threat language with specifics (weapon, time, place) is a credible threat.
  if (seen.has('threat_language') && !seen.has('credible_threat') && (SPECIFICS.test(n.folded) || SPECIFICS.test(n.joined))) {
    const base = reasons.find((r) => r.code === 'threat_language');
    if (base) reasons.push(reason('credible_threat', 'red', 'red.threat', base.span));
  }

  const addressed = isAddressed(n);
  const target = addressed || test(n, THIRD_RX);
  const slur = slurReason(n, target);
  if (slur) reasons.push(slur);

  // An insult ABOUT someone (not to them), when nothing aimed at the reader already covers it.
  if (!seen.has('roast') && !seen.has('insult_at_person')) {
    const about = aboutReason(n);
    if (about) reasons.push(about);
  }

  // Swearing (only when nothing else already puts the message at Standard or above).
  if (hasProfanity(n) && !reasons.some((r) => GRADE_RANK[r.grade] >= GRADE_RANK.standard)) {
    const [first] = profanitySpans(text, n);
    reasons.push(reason('profanity', 'standard', 'standard.profanity', first ?? [0, 0]));
  }

  let grade: Grade = 'family';
  for (const r of reasons) grade = maxGrade(grade, r.grade);
  reasons.sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade]);

  return { grade, reasons, hasTarget: target, addressed, normalized: n };
}
