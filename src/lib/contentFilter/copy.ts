/**
 * content_filter — every user-facing word, in one module. The chat / DM / comment UIs read from
 * here; nothing else composes moderation copy.
 *
 * Rules (policy "ORANGE — design rules"):
 *   - Always name what tripped it. "This violates our guidelines" is forbidden.
 *   - YELLOW is a mirror, not a gate: the sender can always send.
 *   - ORANGE: unlimited edit-and-resend, no cooldown, no strike.
 *   - The recipient is never told a YELLOW happened.
 */
import type { Action, PolicyRef, Reason, ReasonCode, Tier, Verdict } from './types.ts';

/** One short clause per stage-A reason, completing "…because it …". Lowercase, no period. */
export const REASON_CLAUSE: Record<ReasonCode, string> = {
  insult_at_person: 'calls someone a name',
  profanity_at_person: 'swears at someone directly',
  mild_insult: 'uses an insult about someone, and this room asks for a gentler tone',
  slur: 'uses a slur',
  slur_attack: 'uses a slur against someone',
  threat_language: 'reads as a threat to hurt someone',
  credible_threat: 'threatens to hurt someone',
  self_harm_encouragement: 'tells someone to hurt or kill themselves',
  death_wish: 'wishes death or harm on someone',
  personal_info: 'shares a phone number or street address in public',
  doxxing: 'shares where someone lives, works, or goes to school, or their real name',
  pile_on_invite: 'asks other people to go after a specific person',
  sexual_comment_at_person: 'makes a sexual comment at someone',
  off_platform_minor: 'asks a young person to talk somewhere private, off this app',
  secrecy_minor: 'asks a young person to keep secrets or be alone',
  sexual_minor: 'is sexual and sent to a young person',
  age_question_minor: "asks a young person's age",
  similar_example: 'reads a lot like a message meant to hurt someone',
};

/** Stage-B clauses: stage B names the policy section its nearest examples come from. */
export const POLICY_CLAUSE: Record<PolicyRef, string> = {
  'green.own_feelings': 'is about how you feel',
  'green.criticism': 'criticizes an idea or institution',
  'green.disagreement': 'disagrees',
  'green.hard_subjects': 'talks about a hard subject',
  'green.profanity_untargeted': 'swears',
  'green.dark_humor': 'is dark humor',
  'green.everyday': 'is everyday talk',
  'yellow.insult': 'reads like an insult aimed at someone',
  'yellow.mockery': 'reads like mocking how someone looks, sounds, or moves',
  'yellow.sexualized_adult': 'reads like a sexual comment about someone who did not ask for it',
  'yellow.protected_mild_insult': REASON_CLAUSE.mild_insult,
  'orange.slur_attack': REASON_CLAUSE.slur_attack,
  'orange.targeted_harassment': 'reads like harassing a specific person',
  'orange.identity_attack': 'reads like attacking someone for who they are',
  'orange.sexual_directed': 'reads like a sexual comment aimed at someone',
  'orange.pile_on_invite': 'reads like asking others to go after someone',
  'orange.doxxing': "reads like sharing someone's private details",
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
  red: {
    title: "This wasn't sent",
    body: (clause: string) =>
      `This wasn't sent because it ${clause}. A person on our safety team will look at it within 24 hours.`,
  },
} as const;

/**
 * What the client does per tier:
 *   send     GREEN — deliver, no friction.
 *   confirm  YELLOW — show YELLOW_PROMPT; "Send as is" delivers (report the override, see
 *            the Edge Function's `override` mode), "Reword" returns to the editor. No penalty.
 *   edit     ORANGE — do not deliver; show copy.orange.body; edit and resend as often as
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
 * ORANGE and RED name the highest-tier reason's specific issue.
 */
export function senderMessage(verdict: Pick<Verdict, 'tier' | 'reasons'>): string | null {
  if (verdict.tier === 'GREEN') return null;
  if (verdict.tier === 'YELLOW') return YELLOW_PROMPT;
  let top: Reason | undefined;
  for (const r of verdict.reasons) if (r.tier === verdict.tier && !top) top = r;
  const clause = top ? clauseFor(top) : REASON_CLAUSE.similar_example;
  return verdict.tier === 'ORANGE' ? copy.orange.body(clause) : copy.red.body(clause);
}
