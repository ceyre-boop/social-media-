/**
 * content_filter pipeline: stage A, then stage B, grade = max; then the room, the relationship,
 * and the harassment counter. Shared by the app and the `content-filter` Edge Function.
 *
 * Order of operations:
 *   1. Stage A (rules over normalized text). < 1 ms. Produces a grade (types.ts).
 *   2. Stage B (embedding k-NN) — only when stage A found a target AND left the grade below the
 *      ceiling. No target means no cruelty is possible (policy: "Cruelty has a target. A mood
 *      does not."), so self-expression never reaches the embedding model at all.
 *   3. grade = max(A, B). Stage B only escalates.
 *   4. Context, in this order (the first that applies decides the sender's tier):
 *        ceiling grade          ORANGE (rephrase) or RED (blocked). Same at every level.
 *        roast at a stranger    ORANGE bullying. A roast is banter between friends / mutual
 *                               follows (or the host's Trusted Circle); aimed at a stranger it is
 *                               bullying, at every level.
 *        repeated targeting     ORANGE harassing: the Nth hostile message from this sender to the
 *                               same person inside the window (counter kept by the Edge Function).
 *        above the room         ORANGE rephrase naming the room's level. No strike.
 *        insult at a person     YELLOW mirror at Standard; at Open and Max only from a stranger.
 *                               The host's Trusted Circle skips the mirror (live chat).
 *        otherwise              GREEN.
 *   Minors are capped at Standard: a minor sender, or a DM to a minor, is judged against
 *   min(room, Standard).
 */
import { plainMessage, TIER_ACTION } from './copy.ts';
import { classifyB, type ExampleIndex, type StageBConfig } from './stageB.ts';
import { stageA } from './stageA.ts';
import {
  type EvalContext,
  type Grade,
  GRADE_RANK,
  isCeiling,
  LEVEL_RANK,
  MINOR_MAX_LEVEL,
  minLevel,
  type PolicyRef,
  type Reason,
  type ReasonCode,
  type SpeechLevel,
  type StageBSkip,
  type Tier,
  type Verdict,
} from './types.ts';

/** This many earlier hostile messages to the same person inside the window make the next one harassing. */
export const HARASSMENT_PRIOR_THRESHOLD = 2;
/** The harassment window (the Edge Function's counter resets after this). */
export const HARASSMENT_WINDOW_MINUTES = 60;

export type Embedder = (text: string) => Promise<ArrayLike<number>>;

export type StageBDeps = {
  embed: Embedder;
  index: ExampleIndex;
  config: StageBConfig;
};

/** Stage-A codes that aim hostility at the person addressed. */
const HOSTILE_CODES: ReadonlySet<ReasonCode> = new Set([
  'insult_at_person', 'roast', 'bullying', 'harassing', 'death_wish', 'threat_language', 'credible_threat',
  'controlling', 'sexual_comment_at_person', 'slur_attack', 'self_harm_encouragement',
]);
/** Stage-B policy sections that aim hostility at a person. */
const HOSTILE_REFS: ReadonlySet<PolicyRef> = new Set([
  'standard.insult', 'open.roast', 'orange.bullying', 'orange.identity_attack', 'orange.harassing',
  'orange.controlling', 'orange.sexual', 'orange.threat', 'orange.slur_attack', 'red.threat',
  'red.self_harm_encouragement',
]);

export function levelOfGrade(g: Grade): SpeechLevel {
  return isCeiling(g) ? 'max' : g;
}

function contextReason(code: ReasonCode, grade: Grade, policyRef: PolicyRef, span: [number, number]): Reason {
  return { code, grade, span, plainMessage: plainMessage(code), policyRef, stage: 'context' };
}

export async function evaluate(text: string, ctx: EvalContext, b?: StageBDeps | null): Promise<Verdict> {
  const t0 = performance.now();
  const a = stageA(text, ctx);
  const stageAMs = performance.now() - t0;

  const reasons: Reason[] = [...a.reasons];
  let grade: Grade = a.grade;
  let stageBMs: number | null = null;
  let stageBSkipped: StageBSkip | null = null;

  if (isCeiling(a.grade)) stageBSkipped = 'decided_by_stage_a';
  else if (!a.hasTarget) stageBSkipped = 'no_target';
  else if (!b) stageBSkipped = 'no_embedder';
  else {
    const t1 = performance.now();
    try {
      const vec = await b.embed(a.normalized.plain);
      const r = classifyB(vec, b.index, b.config);
      if (r.policyRef && GRADE_RANK[r.grade] > GRADE_RANK[grade]) {
        grade = r.grade;
        reasons.unshift({
          code: 'similar_example',
          grade: r.grade,
          span: [0, text.length],
          plainMessage: plainMessage('similar_example', r.policyRef),
          policyRef: r.policyRef,
          stage: 'B',
        });
      }
    } catch {
      // Stage B unavailable: stage A's verdict stands (A carries every RED rule).
      stageBSkipped = 'no_embedder';
    }
    stageBMs = performance.now() - t1;
  }

  const live = ctx.surface === 'live_chat';
  let room: SpeechLevel = ctx.roomLevel ?? 'standard';
  if (ctx.senderIsAdult === false || ctx.recipientIsMinor === true) room = minLevel(room, MINOR_MAX_LEVEL);
  const friendly =
    ctx.relationship === 'friends' || ctx.relationship === 'mutual' || (live && ctx.senderTrusted === true);

  const has = (code: ReasonCode) => reasons.some((r) => r.code === code);
  const hasB = (ref: PolicyRef) => reasons.some((r) => r.stage === 'B' && r.policyRef === ref);
  const roastAt = has('roast') || (a.addressed && hasB('open.roast'));
  const insultAt = has('insult_at_person') || (a.addressed && hasB('standard.insult'));
  const hostile =
    a.addressed &&
    reasons.some((r) => (r.stage === 'B' ? HOSTILE_REFS.has(r.policyRef) : HOSTILE_CODES.has(r.code))) &&
    // a roast between friends in a room that allows it is banter, not a hostile message
    !(friendly && LEVEL_RANK[room] >= LEVEL_RANK.open && !isCeiling(grade));
  const whole: [number, number] = [0, text.length];

  let tier: Tier;
  let ceiling: Verdict['ceiling'] = null;
  if (isCeiling(grade)) {
    tier = grade === 'red' ? 'RED' : 'ORANGE';
    ceiling = tier;
  } else if (roastAt && !friendly) {
    reasons.unshift(contextReason('bullying_stranger', 'orange', 'orange.bullying', reasons.find((r) => r.code === 'roast')?.span ?? whole));
    tier = 'ORANGE';
    ceiling = 'ORANGE';
  } else if (hostile && (ctx.priorTargetedCount ?? 0) >= HARASSMENT_PRIOR_THRESHOLD) {
    reasons.unshift(contextReason('repeat_targeting', 'orange', 'orange.harassing', whole));
    tier = 'ORANGE';
    ceiling = 'ORANGE';
  } else if (LEVEL_RANK[grade] > LEVEL_RANK[room]) {
    reasons.push(contextReason('above_room_level', grade, reasons[0]?.policyRef ?? 'standard.profanity', reasons[0]?.span ?? whole));
    tier = 'ORANGE';
  } else if (insultAt && !(live && ctx.senderTrusted === true) && (room === 'standard' || !friendly)) {
    tier = 'YELLOW';
  } else {
    tier = 'GREEN';
  }

  return {
    tier,
    action: TIER_ACTION[tier],
    grade: ceiling ? maxCeiling(grade, ceiling) : grade,
    requiredLevel: levelOfGrade(grade),
    ceiling,
    room: { level: room, surface: ctx.surface },
    reasons,
    hostileTargeted: hostile,
    timings: { stageAMs, stageBMs, stageBSkipped },
  };
}

function maxCeiling(g: Grade, c: 'ORANGE' | 'RED'): Grade {
  const cg: Grade = c === 'RED' ? 'red' : 'orange';
  return GRADE_RANK[g] >= GRADE_RANK[cg] ? g : cg;
}
