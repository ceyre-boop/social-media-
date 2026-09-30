# Milestone 3 Brief (Claude Code)

**Prerequisite:** Milestone 2 merged. Read `claude-code-brief.md` for the thesis,
locked stack decisions, and hard invariants — all still apply.

This milestone is **backend foundation**. It builds the systems the product's
actual differentiation rests on.

**Terminology, to prevent conflation:**
- `camera_effects` — visual effects applied to a photo (color, grain, frames)
- `content_filter` — the moderation pipeline that gates messages and chat

These are unrelated systems. Never use the bare word "filter" in code or copy.

---

## 1. Moments — the prompted post

*(Working name. Placeholder like the app name — keep it in the config file.)*

### The intent, and why it isn't BeReal

The goal is **genuine connection**, not a game.

People spend their days doing small specific things that make them who they are.
Friends see one version of each other — the online version, or the in-person
version. A Moment is a look at the other sides: what someone was actually up to
when nobody was around.

The prompt is an **invitation to share something ordinary**, and nothing more.

### Explicitly not this

| Not | Why |
|---|---|
| Countdown timer | Urgency machinery. The brief forbids it |
| Posting window that closes | Missing it must cost nothing |
| Streaks | Punishes normal life |
| Lockout for not posting | No penalty exists |
| "Your friends are waiting" | Guilt as engagement |
| Public ranking of who posted | Not a competition |

**If engagement dips, none of the above is the fix.** They're the mechanics this
product exists to avoid. Flag it rather than reaching for them.

### Behavior

- **1–2 prompts per day**, at randomized times within the user's waking hours
  (default 9:00–21:00 local, user-adjustable)
- Prompt copy is warm and open: *"What are you up to?"* — never *"X minutes left"*
- **No expiry.** Tapping a prompt hours later works exactly the same
- **Posting is always available**, prompt or not. The prompt is a nudge, not a gate
- Prompts respect quiet hours and notification preferences

### Composition

- **In-app camera capture only.** No library import — the point is the actual
  current moment, not a curated one
- Optional caption
- Optional `camera_effects` — a small set of warm presets. Not beauty filters, not
  face-altering. Color and grain treatments consistent with the brand
- Front and back capture is a **deferred decision** — build single-camera, leave
  room in the schema

### Visibility — friends only, always

Moments are **never public**. Not discoverable, not in Discover, not on a public
profile, no shareable link.

This needs a real friends model. `relationships` currently derives from behavior;
Moments need mutual, explicit connection:

```sql
create table friendships (
  user_a_id    uuid not null references users(id) on delete cascade,
  user_b_id    uuid not null references users(id) on delete cascade,
  state        text not null default 'pending',  -- pending|accepted|declined
  requested_by uuid not null references users(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id)  -- canonical ordering, one row per pair
);
```

`user_a_id < user_b_id` keeps one row per pair rather than two directional rows.

**Age rules apply in full.** An adult may not send a friend request to an
unconnected minor. Same RLS enforcement as messaging — see §5.

Add `moment` to the `post_kind` enum. Moments ignore the `visibility` column
entirely; friends-only is enforced in RLS and cannot be overridden.

### Empty state

A user with no friends sees an empty Moments feed. Handle it warmly — this is the
cold-start surface and it's most new users on day one. Show their own Moments plus
a clear path to finding friends. Never fill it with strangers.

---

## 2. Push notification infrastructure

**Build this first.** Moments is made of push; without reliable delivery the
feature doesn't exist.

- Expo Push → APNs and FCM
- Token registration into the existing `devices` table; handle rotation and
  invalidation
- **Permission request timing:** never on first launch. Ask when the user first
  encounters something that needs it, with context for why
- Graceful degradation: everything must work with notifications denied. In-app
  prompt banner replaces push
- Delivery receipt tracking; prune dead tokens

### Types and preferences

Every type independently toggleable:

| Type | Default |
|---|---|
| Moment prompt | on |
| Friend request | on |
| Friend accepted | on |
| Someone you follow went live | on |
| Comment on your post | on |
| Gift received | on |
| Like on your post | **off** |
| Support reply | on |

**Quiet hours,** user-set, default 22:00–08:00 local. Prompts never fire inside
them.

Notification copy is warm and specific. Never manufactured urgency, never guilt,
never "you're missing out."

---

## 3. Scheduled job infrastructure

Needed for prompts, and reused later for relationship recompute and payout runs.
Build it once, properly.

- Supabase `pg_cron`, or Edge Functions on a schedule
- **Idempotent** — a job running twice must not double-send
- Retry with backoff; dead-letter after N failures
- Run log with timing and outcome, queryable

Jobs this milestone:

1. **Prompt scheduler** — daily, per user timezone. Picks 1–2 random times inside
   waking hours, enqueues sends
2. **Prompt dispatcher** — runs every few minutes, sends what's due
3. **Token cleanup** — weekly prune of dead push tokens

Timezone: store an IANA identifier per user, captured at signup, editable in
settings. Never infer from IP.

---

## 4. Support system

### Tier 0 — Guided help (zero API cost)

**First line for everything.** A structured decision tree that looks and behaves
like a conversation but consumes no API credits.

The framing, from Colin: most user problems aren't bugs. They're something skipped,
unread, or assumed obvious. So Tier 0 asks **Socratic questions** that lead the
user to find it themselves, then shows them how to fix it in-app.

- Decision tree stored as data, editable without deploys
- Conversational presentation, not an FAQ list
- Every terminal node either resolves the issue or offers escalation
- **Track which nodes get hit.** High-frequency nodes are engineering defects —
  surface them on a dashboard

Target: resolves the large majority of contacts at zero cost.

### Tier 1 — AI assistance (metered)

Only after Tier 0 fails to resolve, and only for signed-in users.

### Tier 2 — Human (always, for four categories)

Never AI-resolved, routed on first touch:

1. Money — chargebacks, missing payouts, split disputes
2. Appeals of any moderation decision
3. Anything touching self-harm — immediate, no triage
4. Law enforcement and legal process

**AI is disclosed as AI.** Never presented as a person.

### Cost controls — the circuit breaker is mandatory

The risk is an unbounded bill during a traffic spike. Five controls, in priority
order:

1. **Global daily spend cap with automatic degradation.** Crossing the threshold
   switches Tier 1 off and routes everyone to Tier 0. **Automatic, not an alert.**
   This alone makes the catastrophic case impossible. Nothing else ships without it
2. **Authentication required.** No anonymous access to any AI endpoint
3. **Per-user daily quota** (default 10 AI exchanges). Beyond it, Tier 0 until reset
4. **Token cap per conversation** and a max turn count
5. **Response cache** on common questions

Make every threshold a config value, not a constant. Log every AI call with user,
tokens, and cost.

### Creator live assistance

Creators can request help during a live stream. Billed to the creator, typically
fractions of a cent.

**Ledger rules, non-negotiable:**

- Every charge is a `ledger_transactions` entry of kind `support_usage` with
  balanced debit and credit. Never a silent balance adjustment
- **The creator sees the cost before it is incurred.** A confirmation showing the
  estimated charge, every time, however small
- Itemized in their dashboard
- A creator with a zero balance gets Tier 0, never a negative balance

A surprise debit from a creator's earnings is exactly what this platform exists to
not do. Size doesn't change that.

---

## 5. Content filter pipeline

Implements the four tiers already specified in `community-policy.md` (GREEN /
YELLOW / ORANGE / RED). Read that file before building.

### Hard constraint

**Sentiment is never an input.** Not to enforcement, not to ranking, not as a
"positivity signal." Sadness, grief, anger and despair are always GREEN. The only
line is cruelty — a behavior with a target. If sentiment appears in the feature
set, that's a bug.

### Tiered for latency and cost

Live chat is a **pre-publish gate** — nothing renders until it clears. Total budget
150–200ms, which rules out calling a large model per message.

| Stage | Method | Latency | Catches |
|---|---|---|---|
| A | Regex, hash, homoglyph + leetspeak normalization | <1ms | ~70%, the lazy cases |
| B | Small embedding classifier, self-hosted | ~10ms | semantic variants |
| C | LLM escalation, ambiguous middle only | ~300ms | the hard cases |

**Normalize before matching** — unicode lookalikes, leetspeak, emoji substitution,
spacing. Otherwise stage A is whack-a-mole forever.

Stage C must stay under ~2% of traffic. Routing everything to an LLM recreates the
cost problem somewhere you *cannot* degrade — chat moderation can't be switched off
the way support can.

### Creator strictness

Per-stream: **Open / Standard / Protected**, as specified in the policy. Creators
may tighten but never loosen below ORANGE. Trusted Circles bypass YELLOW only.

### Behavior by tier

- **YELLOW** — mirror it back, sender may send anyway, no penalty
- **ORANGE** — doesn't send; name what tripped it; unlimited edit-and-resend, no
  cooldown, no strike
- **RED** — blocked, logged, human review within 24h

Never "this violates our guidelines." Always name the specific issue.

---

## 6. Settings

Must be usable by a 13-year-old and a 70-year-old alike.

- Plain language, no jargon, no nested menus more than two deep
- Grouped: Account · Notifications · Privacy · Safety · Accessibility · Support
- Every toggle has a one-line explanation of what it actually does
- Destructive actions clearly separated and confirmed

Must include: notification types and quiet hours, timezone, `content_filter`
strictness for own streams, motion preference (Full/Calm/Minimal), blocked users,
friend request permissions, data export request, account deletion.

---

## IN SCOPE — build order

**Phase 3A** (stop here if the milestone needs splitting)
1. Push notification infrastructure
2. Scheduled job infrastructure
3. Friendships model + RLS + age rules
4. Moments: capture, `camera_effects`, post, friends-only feed
5. Prompt scheduler and dispatcher

**Phase 3B**
6. Support Tier 0 decision tree
7. Support Tier 1 with the full circuit breaker
8. Content filter stages A and B
9. Settings

---

## OUT OF SCOPE — stop when the above is done

- ❌ Real live streaming (LiveKit, Cloudflare, RTMP)
- ❌ Payments, coins, Stripe, payouts
- ❌ Battles
- ❌ Filter stage C (LLM escalation) — A and B first, measure, then decide
- ❌ Feed ranking
- ❌ R2 migration
- ❌ Creator dashboard
- ❌ App Store submission
- ❌ Front/back dual capture
- ❌ Search *(still unbuilt and still blocking — likely Milestone 4)*

---

## Standing invariants — unchanged

1. No sentiment in ranking or enforcement
2. No reach limitation without a stored plain-language explanation
3. Ledger append-only; corrections are reversing entries
4. Creator terms immutable and versioned
5. Money is integers
6. Coins closed-loop
7. No public follower counts (follow button exists; the count does not)
8. Age rules enforced in RLS, never application logic
9. App name and currency name live in config, never hardcoded

---

## Notes

- Flag scope creep out loud rather than expanding
- Ask before adding dependencies
- Commit in logical units
- If something here seems wrong, say so rather than silently diverging
- Run a fresh-reviewer pass before declaring the milestone done
