/**
 * content_filter — every user-facing word, in one module. The chat / DM / comment UIs and the
 * Settings dial read from here; nothing else composes moderation copy.
 *
 * Rules (policy "ORANGE — design rules", v0.2 speech dial):
 *   - Always name what tripped it. "This violates our guidelines" is forbidden.
 *   - YELLOW is a mirror, not a gate: the sender can always send.
 *   - ORANGE: unlimited edit-and-resend, no cooldown, no strike.
 *   - The recipient is never told a YELLOW happened.
 */
import type { Action, PolicyRef, Reason, ReasonCode, SpeechLevel, Surface, Tier, Verdict } from './types.ts';

/** One short clause per reason, completing "…because it …". Lowercase, no period. */
export const REASON_CLAUSE: Record<ReasonCode, string> = {
  profanity: 'swears',
  insult_at_person: 'calls someone a name',
  insult_about_person: 'calls someone a name',
  roast: 'roasts someone',
  crude_humor: 'is a crude joke',
  dark_humor: 'is a dark or edgy joke',
  slur: 'uses a slur',
  bullying: 'puts someone down for who they are',
  bullying_stranger: "roasts someone who isn't your friend, which reads as bullying",
  harassing: 'keeps going after someone who wants to be left alone',
  repeat_targeting: 'is one more in a run of messages aimed at the same person',
  controlling: 'tries to control someone — where they go, who they see, or their phone',
  slur_attack: 'uses a slur against someone',
  sexual_content: 'is sexual',
  sexual_comment_at_person: 'makes a sexual comment at someone',
  pile_on_invite: 'asks other people to go after a specific person',
  doxxing: 'shares where someone lives, works, or goes to school, or their real name',
  personal_info: 'shares a phone number or street address in public',
  threat_language: 'reads as a threat to hurt someone',
  credible_threat: 'threatens to hurt someone',
  self_harm_encouragement: 'tells someone to hurt or kill themselves',
  death_wish: 'wishes death or harm on someone',
  off_platform_minor: 'asks a young person to talk somewhere private, off this app',
  secrecy_minor: 'asks a young person to keep secrets or be alone',
  sexual_minor: 'is sexual and sent to a young person',
  age_question_minor: "asks a young person's age",
  above_room_level: 'goes past what this room allows',
  similar_example: 'reads a lot like a message meant to hurt someone',
};

/** Stage-B clauses: stage B names the policy section its nearest examples come from. */
export const POLICY_CLAUSE: Record<PolicyRef, string> = {
  'family.own_feelings': 'is about how you feel',
  'family.criticism': 'criticizes an idea or institution',
  'family.disagreement': 'disagrees',
  'family.hard_subjects': 'talks about a hard subject',
  'family.hyperbole': 'is a figure of speech',
  'family.everyday': 'is everyday talk',
  'standard.profanity': 'swears',
  'standard.insult': 'reads like an insult aimed at someone',
  'open.roast': 'reads like roasting someone',
  'open.crude': 'reads like a crude joke',
  'max.dark_humor': 'reads like a dark or edgy joke',
  'max.slur_untargeted': REASON_CLAUSE.slur,
  'orange.bullying': 'reads like bullying someone',
  'orange.identity_attack': 'reads like attacking someone for who they are',
  'orange.harassing': 'reads like harassing a specific person',
  'orange.controlling': 'reads like trying to control someone',
  'orange.slur_attack': REASON_CLAUSE.slur_attack,
  'orange.sexual': 'reads as sexual',
  'orange.pile_on_invite': 'reads like asking others to go after someone',
  'orange.doxxing': "reads like sharing someone's private details",
  'orange.threat': 'reads like a threat to hurt someone',
  'orange.minor_age_question': REASON_CLAUSE.age_question_minor,
  'red.threat': 'reads like a threat to hurt someone',
  'red.self_harm_encouragement': 'reads like telling someone to hurt themselves',
  'red.minor_off_platform': 'reads like moving a young person into private contact',
  'red.minor_sexual': REASON_CLAUSE.sexual_minor,
  'red.coordinated_harassment': 'reads like organizing people to harass someone',
};

/** The clause naming a reason's specific issue. */
export function clauseFor(reason: Pick<Reason, 'code' | 'policyRef'>): string {
  return reason.code === 'similar_example' ? POLICY_CLAUSE[reason.policyRef] : REASON_CLAUSE[reason.code];
}

/** Full sentence for a single reason, e.g. "It calls someone a name." */
export function plainMessage(code: ReasonCode, policyRef?: PolicyRef): string {
  const clause = code === 'similar_example' && policyRef ? POLICY_CLAUSE[policyRef] : REASON_CLAUSE[code];
  return `It ${clause}.`;
}

// ------------------------------------------------------------------ the dial

export type LevelCopy = {
  label: string;
  /** One plain line: what this level lets through. */
  line: string;
  /** A short example of something this level allows (and the one below it doesn't). */
  example: string;
  /** "keeps out …": what a room at this level stops, for the rephrase prompt. */
  keepsOut: string;
};

export const LEVEL_COPY: Record<SpeechLevel, LevelCopy> = {
  family: {
    label: 'Family',
    line: 'Like an old Disney film. No swearing, no insults, no crude jokes. Feelings are always welcome.',
    example: '“I’m so sad today” and “this is awful” are fine. Swears show as ***.',
    keepsOut: 'swearing, insults and crude jokes',
  },
  standard: {
    label: 'Standard',
    line: 'Swearing and heated arguments are fine. Calling someone a name gets a quick “are you sure?” first.',
    example: '“This level is so damn hard” goes straight through.',
    keepsOut: 'roasting, crude jokes and edgy humor',
  },
  open: {
    label: 'Open',
    line: 'Roasting, trash talk and crude jokes, between people who can take it.',
    example: '“Your aim is so bad my grandma could carry you.”',
    keepsOut: 'dark and edgy jokes',
  },
  max: {
    label: 'Max',
    line: 'Everything in Open, plus dark humor and edgy jokes. Still no bullying.',
    example: 'Jokes about your own funeral.',
    keepsOut: '',
  },
};

/** Shown once, plainly, wherever the dial is. None of these send at any level. */
export const ALWAYS_BLOCKED: readonly string[] = [
  'Threats to hurt someone',
  'Sharing where someone lives, works or goes to school',
  'Harassing or bullying a person',
  'Controlling someone: demanding their password or location, cutting them off from friends',
  'Sexual content',
  'Slurs aimed at a person',
  'Anything sexual toward a young person, or trying to get them alone',
];

/** What a room above-level prompt says keeps a message out. */
const KEEPS_OUT_BY_GRADE: Record<Exclude<SpeechLevel, 'family'>, string> = {
  standard: 'swearing and insults',
  open: 'roasting and crude jokes',
  max: 'dark and edgy jokes',
};
const KEEPS_OUT_BY_CODE: Partial<Record<ReasonCode, string>> = {
  profanity: 'swearing',
  insult_at_person: 'insults',
  insult_about_person: 'insults',
  roast: 'roasting',
  crude_humor: 'crude jokes',
  dark_humor: 'dark and edgy jokes',
  slur: 'slurs',
};

export function keepsOut(reason: Pick<Reason, 'code' | 'grade'> | undefined): string {
  if (reason && KEEPS_OUT_BY_CODE[reason.code]) return KEEPS_OUT_BY_CODE[reason.code]!;
  const g = reason?.grade;
  return g === 'standard' || g === 'open' || g === 'max' ? KEEPS_OUT_BY_GRADE[g] : KEEPS_OUT_BY_GRADE.standard;
}

export const YELLOW_PROMPT = 'This might land harder than you mean it to. Send as is, or reword?';

export const copy = {
  yellow: {
    prompt: YELLOW_PROMPT,
    sendAnyway: 'Send as is',
    reword: 'Reword',
  },
  orange: {
    title: "We can't send this as written",
    /** "We can't send this as written — it calls someone a name. Reword it and it'll go through." */
    body: (clause: string) => `We can't send this as written — it ${clause}. Reword it and it'll go through.`,
    edit: 'Edit message',
  },
  room: {
    /** Above the room's level: a rephrase prompt, never a strike. */
    body: (level: SpeechLevel, surface: Surface, what: string) =>
      surface === 'dm'
        ? `They've set their messages to ${LEVEL_COPY[level].label}, which keeps out ${what}. Reword it and it'll go through.`
        : `This room is set to ${LEVEL_COPY[level].label}, which keeps out ${what}. Reword it and it'll go through.`,
  },
  red: {
    title: "This wasn't sent",
    body: (clause: string) =>
      `This wasn't sent because it ${clause}. A person on our safety team will look at it within 24 hours.`,
  },
  viewer: {
    hidden: 'Hidden by your settings',
    show: 'Show',
  },
} as const;

/**
 * What the client does per tier:
 *   send     GREEN — deliver, no friction.
 *   confirm  YELLOW — show YELLOW_PROMPT; "Send as is" delivers (report the override, see
 *            the Edge Function's `override` mode), "Reword" returns to the editor. No penalty.
 *   edit     ORANGE — do not deliver; show the rephrase copy; edit and resend as often as
 *            they like. No cooldown, no strike. A rephrase that passes closes the matter.
 *   blocked  RED — do not deliver; show copy.red.body. Logged and queued for human review.
 */
export const TIER_ACTION: Record<Tier, Action> = {
  GREEN: 'send',
  YELLOW: 'confirm',
  ORANGE: 'edit',
  RED: 'blocked',
};

/**
 * The words to show the SENDER for a verdict, or null when nothing is shown (GREEN).
 * ORANGE and RED name the highest reason's specific issue; an above-room ORANGE names the room's
 * level and what it keeps out.
 */
export function senderMessage(verdict: Pick<Verdict, 'tier' | 'reasons' | 'ceiling' | 'room'>): string | null {
  if (verdict.tier === 'GREEN') return null;
  if (verdict.tier === 'YELLOW') return YELLOW_PROMPT;
  if (verdict.tier === 'ORANGE' && !verdict.ceiling && verdict.reasons.some((r) => r.code === 'above_room_level')) {
    const top = verdict.reasons.find((r) => r.code !== 'above_room_level');
    return copy.room.body(verdict.room.level, verdict.room.surface, keepsOut(top));
  }
  const ceilingGrade = verdict.tier === 'RED' ? 'red' : 'orange';
  const top = verdict.reasons.find((r) => r.grade === ceilingGrade) ?? verdict.reasons[0];
  const clause = top ? clauseFor(top) : REASON_CLAUSE.similar_example;
  return verdict.tier === 'ORANGE' ? copy.orange.body(clause) : copy.red.body(clause);
}
