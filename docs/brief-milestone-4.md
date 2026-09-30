# Milestone 4 Brief (Claude Code)

**Prerequisite:** Milestone 3 merged. Read `claude-code-brief.md` for the thesis and
invariants, `gift-render-spec.md` for gift display, `gift-gallery.md` for the
catalog, `community-policy.md` for safety rules. All still apply.

This milestone makes live real and money real. It is the largest milestone so far
and is split into three phases with hard stop points.

---

## Colin's blockers — required before ANY of this goes to production

Build proceeds in test mode without these. Going live does not.

| Item | Needed for | Status |
|---|---|---|
| LLC formed (Michigan) | Stripe account | not started |
| EIN | business bank account | not started |
| Business bank account | payouts | not started |
| Stripe account + Connect enabled | all payments | not started |
| Cloudflare account + payment method | Stream Live | not started |
| Terms of Service | App Store, and the coin terms are contractual | not started |
| Privacy Policy | App Store, legally required | not started |

**Build against Stripe test keys and Cloudflare dev credentials throughout.** Never
commit live keys. The service-role key and all secrets stay server-side only, never
behind `EXPO_PUBLIC_`.

---

# PHASE 4A — Search

Small, independent, currently blocking. Do it first to get it out of the way.

- **User search** by username and display name. Prefix and fuzzy match — the
  `pg_trgm` index already exists on `profiles.username`
- Results respect blocks: blocked users never appear to each other
- **No follower counts in results.** Show avatar, display name, username, bio
  snippet
- Recent searches, locally stored, clearable
- Empty and no-results states

**Content search is out of scope.** Users only this milestone.

**Stop, verify, commit.**

---

# PHASE 4B — Live streaming and payments

The two large systems. Both are needed before battles and the dashboard.

## 4B.1 — Real live streaming

### Provider

**Cloudflare Stream Live** for broadcast. Per `cost-model.md` this is the managed
path; self-hosting is a later migration at the $300/month trigger.

**Do not build a single-bitrate pipeline.** The adaptive bitrate ladder is what
separates a professional stream from one that stutters and degrades. Managed Stream
Live provides the ladder, edge delivery, and segment handling. That's the reason to
use it.

**LiveKit is for the interactive layer only** — host, co-hosts, invited guests.
Mass viewers never touch WebRTC; its bandwidth pricing is bad at scale. Its free
tier (5,000 participant-minutes) covers this milestone.

### Go live flow

- Creator taps Live → **18+ verification checked in RLS**, not client-side
- Title, optional scheduled start
- Provider stream created, RTMP ingest credentials issued server-side
- Camera preview, mic and camera toggles, front/back switch
- `live_streams` row transitions scheduled → live → ended

### Broadcaster-side upload adaptation — build this

Not provided by any vendor. It lives in your creator app and it is the single most
noticeable quality difference to viewers.

- Monitor the upload socket continuously
- **Drop encode bitrate when the connection degrades.** Never queue frames at target
  bitrate — that backs up the buffer and hard-stalls the stream for everyone
- Hardware encoding, CBR rate control, B-frames off, short keyframe interval
- Surface connection quality to the creator so they know before viewers do

A stream that softens for a few seconds beats one that freezes.

### Viewer

- HLS playback, adaptive, using the provider ladder
- **Real chat** over Supabase Realtime, replacing the M2 stub
- **Real presence and viewer counts**, replacing fake numbers
- Join/leave writes `live_participants`, accumulates `watch_ms`
- `content_filter` gates every chat message **pre-publish** — nothing renders until
  it clears. Stages A and B from Milestone 3; budget 150–200ms

### Anchor metadata (for gift Mode B)

- Face/pose detection on the **broadcaster's device**, on the raw camera frame
  before encoding. Never on viewer devices
- Publish anchor coordinates at 10–15 Hz as stream metadata
- **Every sample carries the presentation timestamp of its source frame.** Viewers
  buffer and match to the displayed frame's PTS. Without this, anchored gifts land
  where the creator *was* and the mode looks broken
- See `gift-render-spec.md` for the payload shape and fallback chain

## 4B.2 — Coins and payments

### Coin purchase — web checkout, not IAP

Per `cost-model.md`: US court orders currently mean no platform commission on
qualifying external link purchases. Coins are bought via web checkout, not IAP.

- `coin_products` seeded: $4.99 / $9.99 / $24.99 / $49.99 / $99.99
- **100 blips = $1.00.** One currency, one published rate, shown openly
- Stripe Checkout, hosted. Deep link back into the app on completion
- Webhook confirms payment → ledger transaction → balance available
- **Idempotent webhook handling.** Stripe retries; double-crediting is unacceptable
- Build the IAP path as a **stubbed fallback behind a region flag** — usable if the
  legal position changes

### Gifting — wire to the ledger

Every gift is a balanced double-entry transaction:

```
debit  sender's coin account
credit creator earnings account (70% of post-fee value)
credit platform revenue account (remainder)
```

- Snapshot the exact `terms_id` that priced it onto `gift_events`
- Itemize `gross_cents`, `app_store_fee_cents`, `platform_fee_cents`,
  `creator_net_cents` — the check constraint already enforces they sum
- **Receipt visible to both parties**, showing all three numbers
- Animation dispatch per `gift-render-spec.md`. A failed animation never affects
  crediting

### Payouts

- Stripe Connect Express onboarding; Stripe handles KYC and 1099s
- **Age verification becomes real here** — the M2 stub is replaced. Provider returns
  a boolean and reference token. **Never store identity documents**
- Payout requires 18+ verified AND Connect KYC complete
- Weekly runs, $20 minimum, 7-day delay per default `creator_terms`
- `payouts` rows with a ledger transaction each

### Fraud controls — build with payments, not after

This is the specific mechanism that kills gifting platforms: stolen card buys
coins → gifted to a colluding account → cashed out → dispute lands after payout.
Organized, automated, and gifting platforms are targeted specifically.

Required before any real money moves:

1. **Payout delay** — minimum 7 days, 14 for new accounts
2. **Velocity limits** on new-account purchasing
3. **ID verification before first payout**, always
4. **Concentration flagging** — alert when a large share of one creator's gifts come
   from few, new, or same-payment-method accounts
5. **Reserve** — hold a percentage against disputes
6. **Dispute webhook handling** — reverse via new ledger entries, never edits

Excessive dispute rates terminate merchant accounts, which ends the business. Treat
the thresholds as configurable and monitored.

**Stop, verify, commit. Do not start 4C until payments are tested end to end in
Stripe test mode.**

---

# PHASE 4C — Battles and creator dashboard

## 4C.1 — Battles

Requires live and gifting working.

### Scoring — decided

**Gift value (TikTok standard).** Raw blip total per participant.

**No score blur.** Score is visible to all participants and viewers continuously for
the full duration. The blur exists only to enable sniping; value scoring works fine
without it.

### Format

- 2, 3, or 4 participants
- Fixed duration, default 2 minutes, creator-configurable
- Invite flow: host invites, participants accept, countdown, start
- Ranking by score at time expiry — 1st through 4th
- Results screen, then return to individual streams

### Rendering — per `gift-render-spec.md` Battle Mode

- Tile layouts for 2, 3, and 4 participants
- **Score bar is a permanent guard.** Nothing renders over it at any alpha
- Full-screen Stage and Takeover are **disabled**. Everything scopes to the
  recipient's tile
- Takeover becomes **Flash-and-Collapse**: 1.2s full screen, then collapses into the
  recipient's tile, 4s total
- **Attribution is mandatory** — recipient tile border pulses, all geometry
  originates inside their tile, nothing crosses boundaries. A gift is a point; if a
  viewer can't tell who received it in half a second, the render is wrong
- Per-tile queues, not one global queue
- Small-tile degradation below 180pt per the spec

### Out of scope

Power-ups, multipliers, brackets, leagues, scheduled events. Single battles only.

## 4C.2 — Creator dashboard

**Purpose is gratitude, not metrics.** It helps a creator know who to thank.

### Shows

- **People, not aggregates.** Who showed up, how long they've been around, who came
  back after a gap
- **Moments** at scale rather than an unusable list: a one-year mark, a return after
  a month away, a first-timer who stayed the whole stream
- Regulars, return rate, room retention, chat participation
- Earnings, fully itemized: gross, app store fee, platform fee, net — per gift and
  in aggregate
- Payout history and next scheduled payout
- Reach events with their plain-language explanations, if any

### Must not

- **Never rank or sort people by spend.** No top-gifter leaderboard. That turns fans
  into a spending ladder and makes creators grade people by wallet. Gifting data
  lives in the ledger for accounting and is absent from the relationship view
- No public counts anywhere

Private to the creator. Accessible mid-stream in a compact form.

---

## OUT OF SCOPE

- ❌ Content search (users only)
- ❌ Battle brackets, leagues, scheduled events, power-ups
- ❌ Creator fund / per-view payouts
- ❌ Filter stage C (LLM escalation)
- ❌ Feed ranking
- ❌ R2 migration
- ❌ Self-hosted live
- ❌ App Store submission
- ❌ IAP (stubbed only)

---

## Standing invariants — unchanged, and now load-bearing

Money is real this milestone. These stop being theoretical:

1. **Ledger append-only.** Corrections are reversing entries, never edits
2. **Money is integers.** Coins as int, USD as int cents. No floats anywhere
3. **Creator terms immutable and versioned.** Gifts snapshot their `terms_id`
4. **Coins closed-loop.** Never user-to-user transferable, never refundable for
   cash, never wagered. Breaking this may constitute money transmission
5. **Balances derived from the ledger**, never stored as a mutable column
6. No sentiment in ranking or enforcement
7. No reach limitation without a stored explanation
8. No public follower counts
9. Age rules in RLS, never application logic
10. App name and currency name in config, never hardcoded

---

## Notes

- **Test coverage on the ledger is not optional.** Every money path needs a test
  proving debits equal credits and balances reconcile
- Webhook handlers must be idempotent and replay-safe
- Flag scope creep out loud rather than expanding
- Commit in logical units; Colin reviews diffs
- Fresh-reviewer pass on each phase before moving to the next
