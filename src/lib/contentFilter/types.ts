/**
 * content_filter — shared types. Pure TypeScript, no dependencies: this module is imported by the
 * app and by the `content-filter` Edge Function (Deno).
 *
 * The speech dial (Community Policy v0.2, Colin 2026-09-30). Four levels, lowest first:
 *
 *   family    old-Disney G. No swearing, no insults, no crude jokes. Feelings are fine.
 *   standard  the default. Swearing and heated arguments; an insult aimed at a person gets the
 *             YELLOW mirror prompt (the sender may still send).
 *   open      + roasting, trash talk, crude humor.
 *   max       + dark humor, edgy jokes, in-group slurs not aimed at anyone.
 *
 * Above every level sits the ceiling: things that never send, at any level (ORANGE: rephrase, no
 * strike; RED: blocked, logged, human review within 24h).
 *
 * The classifier grades each message on ONE ordinal scale (Grade): the four levels, then the two
 * ceiling grades. A level grade is the message's `requiredLevel` — the lowest room / viewer level
 * at which it may be shown.
 *
 * Sentiment is never an input anywhere in this module (no lexicon, model, or feature for it).
 */

export const SPEECH_LEVELS = ['family', 'standard', 'open', 'max'] as const;
export type SpeechLevel = (typeof SPEECH_LEVELS)[number];

export const LEVEL_RANK: Record<SpeechLevel, number> = { family: 0, standard: 1, open: 2, max: 3 };

export function minLevel(a: SpeechLevel, b: SpeechLevel): SpeechLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}
export function maxLevel(a: SpeechLevel, b: SpeechLevel): SpeechLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/** Minors are capped at Standard everywhere (the database enforces it too). */
export const MINOR_MAX_LEVEL: SpeechLevel = 'standard';

/** One ordinal scale: the four levels, then the ceiling (ORANGE, RED). */
export const GRADES = ['family', 'standard', 'open', 'max', 'orange', 'red'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_RANK: Record<Grade, number> = { family: 0, standard: 1, open: 2, max: 3, orange: 4, red: 5 };

export function maxGrade(a: Grade, b: Grade): Grade {
  return GRADE_RANK[a] >= GRADE_RANK[b] ? a : b;
}
export function isCeiling(g: Grade): g is 'orange' | 'red' {
  return g === 'orange' || g === 'red';
}

/** What the SENDER sees. GREEN send, YELLOW mirror, ORANGE rephrase, RED blocked. */
export const TIERS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_RANK: Record<Tier, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

export type Surface = 'live_chat' | 'dm' | 'comment';

/** How the sender relates to the person the message is aimed at. Unknown = strangers. */
export type Relationship = 'friends' | 'mutual' | 'strangers';

/**
 * Policy section a decision rests on. Every reason and every labelled example carries one; the
 * prefix is the grade.
 */
export type PolicyRef =
  // family — shown to everyone
  | 'family.own_feelings'
  | 'family.criticism'
  | 'family.disagreement'
  | 'family.hard_subjects'
  | 'family.hyperbole'
  | 'family.everyday'
  // standard
  | 'standard.profanity'
  | 'standard.insult'
  // open
  | 'open.roast'
  | 'open.crude'
  // max
  | 'max.dark_humor'
  | 'max.slur_untargeted'
  // ceiling, ORANGE (rephrase, no strike)
  | 'orange.bullying'
  | 'orange.identity_attack'
  | 'orange.harassing'
  | 'orange.controlling'
  | 'orange.slur_attack'
  | 'orange.sexual'
  | 'orange.pile_on_invite'
  | 'orange.doxxing'
  | 'orange.threat'
  | 'orange.minor_age_question'
  // ceiling, RED (blocked, logged, 24h review)
  | 'red.threat'
  | 'red.self_harm_encouragement'
  | 'red.minor_off_platform'
  | 'red.minor_sexual'
  | 'red.coordinated_harassment';

export function gradeOfRef(ref: PolicyRef): Grade {
  return ref.split('.')[0] as Grade;
}

export type ReasonCode =
  // level reasons
  | 'profanity'
  | 'insult_at_person'
  | 'insult_about_person'
  | 'roast'
  | 'crude_humor'
  | 'dark_humor'
  | 'slur'
  // ceiling reasons
  | 'bullying'
  | 'bullying_stranger'
  | 'harassing'
  | 'repeat_targeting'
  | 'controlling'
  | 'slur_attack'
  | 'sexual_content'
  | 'sexual_comment_at_person'
  | 'pile_on_invite'
  | 'doxxing'
  | 'personal_info'
  | 'threat_language'
  | 'credible_threat'
  | 'self_harm_encouragement'
  | 'death_wish'
  | 'off_platform_minor'
  | 'secrecy_minor'
  | 'sexual_minor'
  | 'age_question_minor'
  // context reasons
  | 'above_room_level'
  | 'similar_example';

export type Reason = {
  code: ReasonCode;
  grade: Grade;
  /** [start, end) into the ORIGINAL text, so a UI can underline exactly what tripped. */
  span: [number, number];
  /** Names the specific issue in plain words. Never "this violates our guidelines". */
  plainMessage: string;
  policyRef: PolicyRef;
  stage: 'A' | 'B' | 'context';
};

export type EvalContext = {
  surface: Surface;
  /**
   * The level of the room the message goes into: the creator's live chat or post comments, or
   * for a DM / reply, what the recipient accepts. Defaults to 'standard'.
   */
  roomLevel?: SpeechLevel;
  /** Sender ↔ the person addressed. Friends / mutual follows can roast at Open and above. */
  relationship?: Relationship;
  /** Sender is in the stream host's Trusted Circle: treated as a friend in that room. live_chat only. */
  senderTrusted?: boolean;
  /**
   * Earlier hostile messages from this sender to the same person inside the harassment window
   * (the Edge Function's per sender→target counter). This message makes it n+1.
   */
  priorTargetedCount?: number;
  /** DMs/comments with a known recipient: the recipient is under 18. */
  recipientIsMinor?: boolean;
  /** The sender is 18+. Unknown is treated as adult for minor-safety rules (the safer side). */
  senderIsAdult?: boolean;
};

/** What the client does with a verdict. See ./copy.ts for the words. */
export type Action = 'send' | 'confirm' | 'edit' | 'blocked';

export type Verdict = {
  /** What the sender gets, in this room. */
  tier: Tier;
  action: Action;
  /** Content grade before room / relationship context (max of stage A and stage B). */
  grade: Grade;
  /** Lowest level at which this may be shown. Stored on the row; viewers' clients hide above it. */
  requiredLevel: SpeechLevel;
  /** Set when the message can't be sent at any level. */
  ceiling: 'ORANGE' | 'RED' | null;
  /** The room this verdict was made for (the rephrase prompt names its level). */
  room: { level: SpeechLevel; surface: Surface };
  reasons: Reason[];
  /** A hostile message aimed at a person: the Edge Function bumps the sender→target counter. */
  hostileTargeted: boolean;
  timings: { stageAMs: number; stageBMs: number | null; stageBSkipped: StageBSkip | null };
};

export type StageBSkip = 'no_target' | 'decided_by_stage_a' | 'no_embedder';
