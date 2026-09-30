# Milestone 4: search, real live, real money, battles, creator dashboard (plan)

Brief: `~/Downloads/milestone-4-brief.md`, copied to `docs/brief-milestone-4.md` on execution.
The Milestone 2 plan that used to live here is in git history; Milestone 3's is
`Plans/milestone-3.md`.

## Context
Milestone 4 makes live streaming and money real, in three phases with hard stops:
4A search → 4B live + payments → 4C battles + dashboard.

Three facts shape how it runs:

1. **Milestone 3 isn't merged yet.**
   - Friendships, Moments and prompts are finished on branch
     `origin/m3-friendships-moments`: 530 database tests pass, and the web walk
     passed.
   - That agent was blocked from pushing to main without review.
   - 3B hasn't started (support, content filter, settings).
   - 4B's live chat needs content-filter stages A and B, so 3B must land before 4B.
2. **Stripe: DECIDED. Colin creates a Stripe Sandbox.**
   - He puts its *test* keys in `.env` himself: `STRIPE_SANDBOX_SECRET_KEY`,
     `EXPO_PUBLIC_STRIPE_SANDBOX_PUBLISHABLE_KEY`, `STRIPE_SANDBOX_WEBHOOK_SECRET`.
   - All 4B.2 code reads only these.
   - Live keys stay unused, and a guard refuses to start if a `sk_live_` key is
     configured for a non-production run.
3. **Live broadcasting needs native code, so dev builds rather than Expo Go.**
   - Needed for WHIP/RTMP publishing, encoder bitrate control, and on-device
     face/pose detection.
   - The Android dev build is set up.
   - iOS needs Colin's Apple Developer account.

## Sequencing
0. **Land M3 3A:**
   - A fresh reviewer pass on `m3-friendships-moments`, then fast-forward `main`
     and redeploy the preview.
   - Run `bun pm trust @shopify/react-native-skia` (downloads Skia's prebuilt native
     binaries, the standard install step) so the next Android dev build includes
     Skia.
   - Reconcile `brand.momentsName` vs `brand.moment.{singular,plural}` down to one.
   - Wire push-tap → `/moments/new`.
1. **M3 3B:** support Tier 0/1 with the circuit breaker, content filter A+B,
   settings. Then review.
2. **4A search.** Independent, so it runs in parallel with step 1.
3. **4B.1 live:** after the content filter and Colin's Cloudflare account.
4. **4B.2 payments:** after the Sandbox keys exist.
5. **4C:** only after payments pass end to end in Sandbox.

A fresh reviewer pass runs at the end of each phase.

## Colin's blockers
Already in the brief: LLC, EIN, business bank, Stripe with Connect, Cloudflare with
a payment method, Terms of Service, Privacy Policy.

New:
- **Stripe Sandbox:** create it, and put its test keys in `.env`.
- **Apple Developer account:** needed for the iOS broadcaster build.
- **Firebase:** Android push.
- **Age verification:** Stripe Identity is free in the Sandbox, and ~$1.50 per
  check in production.

## Phase 4A: user search
- **Database:**
  - RPC `search_users(q, lim)`: prefix + trigram on username and display name,
    reusing the existing `pg_trgm` index; add one on `display_name`.
  - Ranking: exact → prefix → similarity.
  - Hides blocked users (both directions) and deleted/banned accounts.
  - Returns avatar, name, username, bio snippet. **No counts.**
  - Rate-limited.
  - pgTAP tests.
- **App:**
  - A search screen reached from the Home and Discover headers.
  - Debounced, with results linking to `/u/[username]`.
  - Recent searches stored locally and clearable.
  - Empty and no-results states.
  - The `/friends` exact-username lookup switches to this search.

## Phase 4B.1: real live
- **Provider interface:** `src/lib/live/provider.ts` for Cloudflare Stream Live.
- **Edge Function `live-create`:**
  - The 18+ verified check is enforced in the database.
  - Ingest credentials are issued server-side only.
  - Cloudflare webhooks drive `live_streams` status: scheduled → live → ended.
- **Broadcaster (dev build):**
  - Recommend WHIP ingest (Stream Live supports it), via a WebRTC publisher.
  - **Upload adaptation:**
    - Read send-side bitrate estimates and step the encoder down and up.
    - CBR, hardware encoder, no B-frames, 1–2 s keyframes.
    - A connection-quality meter for the creator.
  - Camera, mic and flip toggles.
- **Viewer:** adaptive HLS through expo-video.
- **Real chat:** Supabase Realtime, gated pre-publish by content filter A+B within
  150–200 ms.
- **Real presence:** `live_participants` with `watch_ms`, and the real viewer count.
- **LiveKit (free tier):** for co-hosts and guests only.
- **Anchor metadata:**
  - On-device face/pose detection.
  - 10–15 Hz samples carrying the source frame's PTS.
  - The viewer uses the existing PTS engine in `src/components/gifts/anchor/`.

## Phase 4B.2: coins and payments (Sandbox only)
- **Coin products:** $4.99–$99.99, in blips via `brand.ts`.
- **Purchase:**
  - Stripe Checkout (hosted) with a deep link back into the app.
  - The `stripe-webhook` function verifies the signature, dedupes on event id, and
    writes a balanced ledger transaction.
  - Balances are derived from the ledger, never stored.
- **IAP:** a stub behind a region flag.
- **Gifting:**
  - A security-definer `send_gift`: double entry, `terms_id` snapshot, itemised
    cents.
  - Receipts for both parties.
  - Animations are decoupled from crediting.
  - Start from branch `later/money-rpcs`.
- **Payouts:**
  - Connect Express.
  - Real age verification (a boolean plus a reference; no documents stored).
  - Weekly runs through the M3 job system: $20 minimum, 7-day delay (14 days for
    new accounts), plus a reserve.
- **Fraud controls:** velocity limits, ID before the first payout, concentration
  flags, reserve, and dispute reversals written as new ledger entries. All
  thresholds live in config.
- **Tests:** a ledger test for every money path, plus webhook replay and
  idempotency.
- **Stop:** end-to-end in the Sandbox before 4C.

## Phase 4C: battles and dashboard
- **Battles:**
  - 2–4 participants, 2-minute default.
  - Invite → accept → countdown → start.
  - Scored by gift value, with the score always visible.
  - Results ranked 1st to 4th.
  - Battle Mode tiles per the render spec: score-bar guard, Flash-and-Collapse,
    per-tile queues, attribution, small-tile degradation.
- **Creator dashboard** (gratitude, not metrics):
  - People, not aggregates; Moments at scale.
  - Itemised earnings, payouts, reach explanations.
  - **Never sorted by spend.**
  - A compact mid-stream view.

## Out of scope
Unchanged from the brief.

## Verification
- pgTAP per phase: search privacy, ledger balance on every path, webhook
  idempotency, fraud rules.
- Edge Function tests with Stripe and Cloudflare stubs, plus Sandbox end-to-end
  with test cards.
- The broadcaster is tested on the Android dev build (Colin's device).
- Web walks at 390 and 1440 widths, and a fresh review per phase.
