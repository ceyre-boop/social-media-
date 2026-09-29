# Social platform — fixed schema + Next.js app scaffold

## Context
TABOOST pasted `CORE SCHEMA v0.1` (identity, graph, posts/reels/stories, reach transparency, DMs, live, double-entry coin ledger, creator terms, T&S, notifications) into an empty repo (`~/social-media-`, only `.claude/` + `.git`). Chosen scope: **full app scaffold** — corrected schema as a Supabase migration plus a Next.js app on top. The schema as written fails to apply, so fixing it is step 1.

## Stack (defaults, no further questions)
- Next.js App Router (latest), TypeScript, bun only, Tailwind + shadcn/ui.
- Supabase: local via `bunx supabase` (Docker), `@supabase/ssr` for auth cookies, Supabase Storage for media in v0 (the `provider` column = `'supabase'`; Mux/Cloudflare Stream later).
- Types generated with `bunx supabase gen types typescript --local > lib/db/types.ts`.

## Phase 1 — Migration `supabase/migrations/0001_core.sql`
Paste the schema verbatim, then apply these fixes:
1. `create extension if not exists citext;`
2. `users.is_adult` → drop the generated column; add `function is_adult(uid uuid) returns boolean stable` (computes from `date_of_birth`).
3. `users.id` references `auth.users(id) on delete cascade`; trigger on `auth.users` insert creates `users` + `profiles` rows (username from signup metadata).
4. Ledger append-only: replace the `do instead nothing` rules with a `before update or delete` trigger that raises an error, plus a `before truncate` trigger. Apply the same to `gift_events`, `coin_purchases`, and `creator_terms` (only `superseded_at` may be set, once, and only from null).
5. Balance guarantee: a deferrable constraint trigger on `ledger_entries` asserts sum(debits) = sum(credits) per `transaction_id` and currency at commit.
6. Posting functions (`security definer`, the only write path): `purchase_coins(...)` and `send_gift(...)`. `send_gift` resolves the current `creator_terms`, computes the itemization in integer cents, writes `gift_events` + the balanced ledger transaction, and rejects the gift if the sender's balance is short or the sender/recipient is not an adult.
7. `creator_terms`: `unique nulls not distinct (user_id, version)`; partial unique index so only one non-superseded row exists per user.
8. Exactly-one checks: `gift_events` `num_nonnulls(stream_id, post_id) = 1`; `reports` `num_nonnulls(target_*) = 1`.
9. Missing FKs: `profiles.avatar_media_id → media_assets`, `ledger_entries.currency` must match the account's currency (checked in the balance trigger).
10. Counter triggers for follower, following, post, like, and comment counts.
11. RLS on every table. Examples:
    - Public posts are readable by anyone; followers-only posts by followers; nothing is visible across a block.
    - `reach_events` and `post_daily_stats` are readable only by the post's author.
    - Ledger and money tables are selectable by their owner; nobody gets direct insert (the posting functions only).
    - Messages are readable by conversation members only.
    - Reports can be inserted by any user and selected by the reporter only.

`supabase/seed.sql`: the default creator-terms row, 3 coin products, 5 gift catalog items, and 3 test users.

## Phase 2 — Database tests (`supabase/tests/*.test.sql`, pgTAP via `bunx supabase test db`)
- Ledger: UPDATE, DELETE, and TRUNCATE all raise; an unbalanced transaction fails at commit.
- `send_gift`: the itemization adds up to gross; the terms snapshot is recorded; insufficient balance is rejected; a minor sender is rejected.
- Terms: a second non-superseded row is rejected; editing `creator_share_bps` is rejected.
- RLS: user B can't read A's reach_events, ledger, or DMs; blocked users can't see each other's posts.

## Phase 3 — App (`app/`)
| Route | Does |
|---|---|
| `/signup`, `/login` | Supabase email auth. DOB is collected at signup. |
| `/` | Following feed, plus a public fallback (posts_feed_idx). |
| `/new` | Upload image/video to Storage → `media_assets` → post, reel, or story (a story sets `expires_at` to now + 24h). |
| `/[username]` | Profile, follow/unfollow, post grid, and a stories ring. |
| `/p/[id]` | Post, likes, threaded comments, and a report button. |
| `/p/[id]/insights` (author only) | `post_daily_stats` plus the `reach_events` list with each explanation shown verbatim. This page is what makes the no-shadowban promise visible. |
| `/wallet` | Coin balance (from `ledger_balances`), purchase history, and a dev-only "buy coins" action (Stripe/IAP stub behind a flag). |
| `/creator` | Current terms `summary`, a per-gift receipt table (gross / app store / platform / net), and earnings to date. |
| `/messages` | DM list and thread; friends only; Supabase Realtime for new messages. |
| `/mod` (moderator role) | Report queue ordered by priority, a decision form that requires a rationale, and the appeals due list. |

Server actions live in `lib/actions/*`. Money goes only through `rpc('send_gift')` and `rpc('purchase_coins')`.

**Deferred (schema only, no UI yet):** live streaming (LiveKit), real IAP/Stripe purchase verification, Stripe Connect payouts, push notifications. Each of these is its own follow-up.

## Critical files
- `supabase/migrations/0001_core.sql`, `supabase/seed.sql`, `supabase/tests/`
- `lib/supabase/{server,client,middleware}.ts`, `lib/db/types.ts`, `lib/actions/`
- `app/` routes above; `middleware.ts` refreshes the session

## Execution
Plan-then-build per CLAUDE.md:
- Phases 1–2 go to Forge (E3 coding).
- Phase 3 is split across 2 builders: feed/profile/post, and wallet/creator/messages/mod.
- The reviewer reads the final diff.
- Commit after each phase and push to origin.

## Verification (pass/fail signals)
1. `bunx supabase db reset` applies the migration and seed with zero errors.
2. `bunx supabase test db`: all pgTAP tests pass.
3. `bun run build` and `bun run lint` are clean; `bunx tsc --noEmit` is clean.
4. `bun test` passes the server-action unit tests (itemization math, story expiry).
5. `bun dev` + Interceptor walk, with screenshots:
   - Sign up as A and B; A posts an image; B follows and sees it in the feed, likes it, and comments.
   - B buys coins and gifts A; A's `/creator` receipt shows a gross that equals the sum of the three parts.
   - A's `/p/[id]/insights` shows the seeded reach_event explanation; B gets a 404 on that page.
