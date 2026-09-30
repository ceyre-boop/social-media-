/**
 * content_filter — shared types. Pure TypeScript, no dependencies: this module is imported by the
 * app and by the `content-filter` Edge Function (Deno).
 *
 * Tiers are the four in `# Community Policy v0.md`. Sentiment is never an input anywhere in this
 * module (no lexicon, model, or feature for it): the only line is cruelty with a target.
 */

export const TIERS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_RANK: Record<Tier, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

export function maxTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export type Surface = 'live_chat' | 'dm' | 'comment';

/** Per-stream creator setting (policy "Creator threshold"). No value can loosen ORANGE or RED. */
export type ChatStrictness = 'open' | 'standard' | 'protected';

/** Policy section a decision rests on. Every reason and every labelled example carries one. */
export type PolicyRef =
  | 'green.own_feelings'
  | 'green.criticism'
  | 'green.disagreement'
  | 'green.hard_subjects'
  | 'green.profanity_untargeted'
  | 'green.dark_humor'
  | 'green.everyday'
  | 'yellow.insult'
  | 'yellow.mockery'
  | 'yellow.sexualized_adult'
  | 'yellow.protected_mild_insult'
  | 'orange.slur_attack'
  | 'orange.targeted_harassment'
  | 'orange.identity_attack'
  | 'orange.sexual_directed'
  | 'orange.pile_on_invite'
  | 'orange.doxxing'
  | 'orange.minor_age_question'
  | 'red.threat'
  | 'red.self_harm_encouragement'
  | 'red.minor_off_platform'
  | 'red.minor_sexual'
  | 'red.coordinated_harassment';

export type ReasonCode =
  | 'insult_at_person'
  | 'profanity_at_person'
  | 'mild_insult'
  | 'slur'
  | 'slur_attack'
  | 'threat_language'
  | 'credible_threat'
  | 'self_harm_encouragement'
  | 'death_wish'
  | 'personal_info'
  | 'doxxing'
  | 'pile_on_invite'
  | 'sexual_comment_at_person'
  | 'off_platform_minor'
  | 'secrecy_minor'
  | 'sexual_minor'
  | 'age_question_minor'
  | 'similar_example';

export type Reason = {
  code: ReasonCode;
  tier: Tier;
  /** [start, end) into the ORIGINAL text, so a UI can underline exactly what tripped. */
  span: [number, number];
  /** Names the specific issue in plain words. Never "this violates our guidelines". */
  plainMessage: string;
  policyRef: PolicyRef;
  stage: 'A' | 'B';
};

export type EvalContext = {
  surface: Surface;
  /** live_chat only; defaults to 'standard'. */
  strictness?: ChatStrictness;
  /** Sender is in the stream host's Trusted Circle (bypasses YELLOW only). live_chat only. */
  senderTrusted?: boolean;
  /** Age of the sender's account in days (Protected holds new accounts briefly). */
  senderAccountAgeDays?: number;
  /** DMs/comments with a known recipient: the recipient is under 18. */
  recipientIsMinor?: boolean;
  /** The sender is 18+. Unknown is treated as adult for minor-safety rules (the safer side). */
  senderIsAdult?: boolean;
};

/** What the client does with a verdict. See ./copy.ts for the words. */
export type Action = 'send' | 'confirm' | 'edit' | 'blocked';

export type Verdict = {
  tier: Tier;
  /** Tier before creator strictness / Trusted Circle modifiers. */
  rawTier: Tier;
  action: Action;
  reasons: Reason[];
  /** Protected stream + new account: hold the line briefly before it renders (flag only). */
  hold: boolean;
  timings: { stageAMs: number; stageBMs: number | null; stageBSkipped: StageBSkip | null };
};

export type StageBSkip = 'no_target' | 'decided_by_stage_a' | 'no_embedder';
