/**
 * content_filter pipeline: stage A, then stage B, tier = max; then creator strictness and Trusted
 * Circles. Shared by the app and the `content-filter` Edge Function.
 *
 * Order of operations:
 *   1. Stage A (rules over normalized text). < 1 ms.
 *   2. Stage B (embedding k-NN) — only when stage A found a target AND left the tier below ORANGE.
 *      No target means no cruelty is possible (policy: "Cruelty has a target. A mood does not."),
 *      so self-expression never reaches the embedding model at all.
 *   3. rawTier = max(A, B). Stage B only escalates.
 *   4. Modifiers (live chat only), which can only touch YELLOW:
 *        Protected: a mild insult about a person (GREEN elsewhere) becomes YELLOW; new accounts
 *                   are flagged `hold` (render after a short delay).
 *        Open, or the sender is in the host's Trusted Circle: YELLOW becomes GREEN.
 *      ORANGE and RED are never modified: a creator can never loosen below ORANGE.
 */
import { plainMessage, TIER_ACTION } from './copy.ts';
import { classifyB, type ExampleIndex, type StageBConfig } from './stageB.ts';
import { stageA } from './stageA.ts';
import { type EvalContext, maxTier, type Reason, type StageBSkip, type Tier, TIER_RANK, type Verdict } from './types.ts';

/** Protected rooms hold messages from accounts younger than this (days). */
export const NEW_ACCOUNT_HOLD_DAYS = 7;

export type Embedder = (text: string) => Promise<ArrayLike<number>>;

export type StageBDeps = {
  embed: Embedder;
  index: ExampleIndex;
  config: StageBConfig;
};

export async function evaluate(text: string, ctx: EvalContext, b?: StageBDeps | null): Promise<Verdict> {
  const t0 = performance.now();
  const a = stageA(text, ctx);
  const stageAMs = performance.now() - t0;

  const reasons: Reason[] = [...a.reasons];
  let rawTier: Tier = a.tier;
  let stageBMs: number | null = null;
  let stageBSkipped: StageBSkip | null = null;

  if (TIER_RANK[a.tier] >= TIER_RANK.ORANGE) stageBSkipped = 'decided_by_stage_a';
  else if (!a.hasTarget) stageBSkipped = 'no_target';
  else if (!b) stageBSkipped = 'no_embedder';
  else {
    const t1 = performance.now();
    try {
      const vec = await b.embed(a.normalized.plain);
      const r = classifyB(vec, b.index, b.config);
      if (r.tier !== 'GREEN' && r.policyRef && TIER_RANK[r.tier] > TIER_RANK[rawTier]) {
        rawTier = maxTier(rawTier, r.tier);
        reasons.unshift({
          code: 'similar_example',
          tier: r.tier,
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
  const strictness = live ? (ctx.strictness ?? 'standard') : 'standard';
  let tier = rawTier;

  if (tier === 'GREEN' && strictness === 'protected' && a.mildInsult) {
    tier = 'YELLOW';
    reasons.push(a.mildInsult);
  }
  if (tier === 'YELLOW' && live && (strictness === 'open' || ctx.senderTrusted === true)) {
    tier = 'GREEN';
  }

  const hold =
    strictness === 'protected' && (ctx.senderAccountAgeDays ?? Number.POSITIVE_INFINITY) < NEW_ACCOUNT_HOLD_DAYS;

  return {
    tier,
    rawTier,
    action: TIER_ACTION[tier],
    reasons,
    hold,
    timings: { stageAMs, stageBMs, stageBSkipped },
  };
}
