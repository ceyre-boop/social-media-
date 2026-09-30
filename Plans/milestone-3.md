# Milestone 3: backend foundation (plan)

Brief: `docs/brief-milestone-3.md`. Standing invariants unchanged.

## Flags before building (Colin decides)
1. **Friends vs "Friends" visibility. DECIDED (Colin): keep both.** Posts marked
   "Friends" keep meaning "you're both regulars of each other" (behaviour-derived).
   Only Moments use the new explicit friendships. UI copy must keep these distinct
   (for example, visibility label "Regulars" or an explanation line), so users
   aren't confused by two meanings of "friend".
2. **Creator live assistance billing** is ledger money plus live streaming, and
   both are out of scope this milestone. Recommend deferring it: build Tier 0, 1
   and 2 for everyone now, and live-assist billing with payments.
3. **Push needs an Expo account.** Expo push tokens require an EAS project id
   (`eas init`, free, Colin's login). Android push doesn't work in Expo Go since
   SDK 53, so Android needs a dev build. iOS Expo Go works. Web gets the in-app
   banner, not push.
4. **camera_effects: DECIDED (Colin): add Skia.** Needs one dependency: `@shopify/react-native-skia` (ships
   in Expo Go) for colour and grain presets baked into the photo. Alternative:
   store the preset id and apply it at display time only (no dependency, but the
   file itself stays unedited).
5. **Tier 1 AI** runs on Claude (Haiku 4.5) from a Supabase Edge Function. Needs
   an Anthropic API key as a project secret. Default caps: global $5/day, 10
   exchanges per user per day, 4,000 tokens per conversation, 8 turns. All are
   config.
6. **content_filter stage B** uses Supabase's built-in embedding model (gte-small,
   in Edge Functions, no extra host) plus nearest-neighbour against a labelled
   example set I write from the Community Policy. Accuracy has to be measured.
   The labelled set is the real work, and Colin should review it.
7. **Old `friendships` table** (from schema v0.1: requester/addressee/status) is
   unused by the app. It gets replaced by the brief's canonical one-row-per-pair
   table.

## Phase 3A (build order)
1. **Push infrastructure.**
   - Register the Expo push token into `devices`, and handle rotation and
     invalidation.
   - Ask for permission in context (first Moment prompt or friend request),
     never at launch.
   - `notification_prefs` table: one row per user and type, with the brief's
     defaults, and quiet hours (default 22:00–08:00).
   - `send-push` Edge Function using the Expo Push API with receipt polling.
     Dead tokens are marked and pruned.
   - In-app banner fallback when permission is denied.
2. **Scheduled jobs.**
   - `pg_cron` plus `pg_net` calling Edge Functions.
   - A `job_runs` table (queryable run log: timing and outcome).
   - A `job_queue` with idempotency keys (unique), retry with exponential
     backoff, and a dead letter after N failures.
   - `users.timezone` (IANA): captured at signup from the device, and editable.
3. **Friendships.**
   - Canonical `(user_a_id < user_b_id)` table: pending, accepted or declined,
     with `requested_by`.
   - RLS age rules reuse migration 010's DM rules: an adult can't request an
     unconnected minor.
   - Request, accept, decline and remove, enforced in the database.
4. **Moments.**
   - `post_kind` gains `moment`. Moments are friends-only through RLS whatever
     their `visibility`: never public, never in Discover, never on a public
     profile, no share link.
   - Capture is in-app camera only, with an optional caption and optional
     `camera_effects` presets. There's a `capture_mode` column for future
     front/back capture.
   - A Moments feed of your own plus your friends'. The empty state is warm, with
     a path to find friends, and never shows strangers.
5. **Prompts.**
   - The scheduler runs daily per user timezone: 1–2 random times inside waking
     hours (default 9:00–21:00, adjustable), and never in quiet hours.
   - The dispatcher runs every 5 minutes.
   - Copy is warm: "What are you up to?" There's no expiry, streaks, countdown
     or ranking.

## Phase 3B
6. **Support Tier 0.**
   - A decision tree stored as data (`support_nodes` and `support_edges`),
     editable without deploys, and presented as a conversation.
   - Every leaf either resolves or escalates.
   - Node-hit tracking, with a small dashboard of the most-hit nodes.
7. **Support Tier 1.**
   - Claude through an Edge Function, signed-in users only, disclosed as AI.
   - The global daily spend cap flips Tier 1 off automatically (circuit breaker).
   - A per-user quota, token and turn caps, a response cache, and every call
     logged with user, tokens and cost.
   - **Tier 2 routing:** money, appeals, self-harm (immediate) and legal go to
     humans on first touch.
8. **Content filter stages A and B.**
   - Stage A: normalisation (unicode lookalikes, leetspeak, emoji, spacing), then
     regex and hash matching.
   - Stage B: embedding nearest-neighbour.
   - Tiers are GREEN, YELLOW, ORANGE and RED per the policy. Sentiment is never
     a feature, and a test asserts sad, angry and grieving texts come back GREEN.
   - Creator strictness (Open, Standard, Protected) and Trusted Circles.
   - Chat pre-publish gate with a 150–200 ms budget, measured.
   - RED events are logged for human review within 24h.
9. **Settings.**
   - Groups: Account · Notifications · Privacy · Safety · Accessibility ·
     Support.
   - At most two levels deep, with a one-line explanation on every toggle.
   - Destructive actions are separated and confirmed.
   - Data export is a request only (the export job comes later).

## Out of scope
Real live streaming, payments and coins, battles, filter stage C, ranking, R2,
creator dashboard, App Store, front/back capture, search (Milestone 4).

## Verification
- pgTAP for every RLS and age rule, idempotency, and the circuit breaker.
- Unit tests for normalisation and the tier classifier, including the
  never-sentiment set.
- Edge Function tests.
- Web walk at 390 and 1440 widths.
- A fresh reviewer pass before calling it done.
