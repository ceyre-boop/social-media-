# Smiley — milestone 1 vertical slice (per `docs/claude-code-brief_smiley.md`)

## Context
Colin's brief replaces my earlier Next.js plan. Locked stack: Expo + Supabase, RLS as the authorization layer. The relationship model has no follow button.

This milestone is one loop on a real device: **signup → profile → post an image → feed → like**. It does not include video, money, live, DMs, moderation, ranking, stories, or the recompute job (§9).

**Where things stand:**
- Forge's corrected DB is committed as 538b30f: a single migration, 72 passing pgTAP tests.
- The Next.js files are still tracked (my `git rm` aborted). The untracked Next.js helpers are already deleted.

## Conflicts with the brief I'm resolving (Colin reviews the diff)
1. **`users.is_adult` generated column (§7 says "use it"):** Postgres rejects it, because `current_date` is not immutable.
   - I'm replacing it with a `stable` `is_adult(uid)` function, used inside RLS helpers.
   - Clients get no EXECUTE on it, so they can't probe other users' age.
2. **Migration 001 "as written":** it can't apply. 001 carries only the minimal fixes, each commented `-- FIX:`: `citext` extension, the is_adult function, and `users.id → auth.users`.
3. **Ledger rules "discard writes" (§6.3):** I'm keeping Forge's triggers, which **raise** instead of discarding, and also block TRUNCATE. It's the same invariant, but a silent discard hides bugs.
4. **Money RPCs Forge built** (`purchase_coins`, `send_gift`) are §9 scope creep. They move to branch `later/money-rpcs` and come out of main. Tables and no-client-write RLS stay.
5. **`posts.visibility` mapping to relationships** (the brief doesn't define it):
   - `public` = anyone.
   - `followers` = the viewer's relationship to the author is `returning` or `regular`.
   - `friends` = mutual (both directions `regular`).
   - `private` = the author only.
6. **`bun run typecheck`, not npm:** the global rule is bun only.
7. **Dependencies:** Expo, expo-router, expo-image-picker, and expo-sqlite (for the Supabase session store), plus Supabase and FlashList. Nothing else, so no approval is needed under §10.

## Step 1 — DB restructure (Forge, reusing 538b30f)
Split `supabase/migrations/20260929000000_core.sql` into:
- **`..._001_initial_schema.sql`**: `docs/schema-v0.1.sql` verbatim, plus the `-- FIX:` items above.
- **`..._002_relationship_model.sql`**: the brief's §4 SQL exactly.
  - Drop `follows` and the follower/following counters and their triggers.
  - Add `users.age_verified`, `age_verified_at`, and `age_verification_ref`.
  - Add a check on `relationships.state`.
  - Add helpers `relationship_state(actor, subject)` and `is_mutual(a, b)`.
- **`..._003_rls_policies.sql`**: deny-by-default on every table, reusing Forge's policies, helpers, grants, and ledger/terms triggers. Changes:
  - `profiles`: public read, self-insert and self-update. The profile is created on first login, **not** by the auth trigger; the auth trigger creates only the `users` row, with DOB from signup metadata.
  - `posts`: read per the visibility mapping above, not across blocks; author-write only.
  - `likes` and `comments`: authenticated insert, author-delete.
  - `interactions`: no client grants at all. An `after insert` security-definer trigger on `likes` writes the `'like'` interaction. This is how "like writes both rows" holds without giving clients a write path.
  - `relationships`: select by actor or subject; no client writes.
  - `messages` insert follows the §7 age rules, via `can_dm`, rewritten on relationships:
    - A minor may DM only a mutual relationship.
    - An adult may DM an unconnected minor never.
    - Adult ↔ adult requires both to be age-verified, or to be mutual.
  - `live_streams` insert requires a verified adult. `gift_events` insert requires an adult, verified recipient with `payout_accounts.payouts_enabled`.
  - `message_requests` view: exposes sender and created_at, never `body`, until the request is accepted.
- **`seed.sql`**: alice, bob, and minnie from Forge, plus 2 more users; sample posts with every visibility; interactions and relationships rows so the visibility rules are testable.
- **`supabase/tests/`**: keep the ledger and terms tests; drop the money-RPC tests and the follows-based tests. Add:
  - A cannot update B's profile.
  - A cannot insert interactions directly.
  - A cannot read B's private post, or B's followers-only post without a relationship, and can after one.
  - Liking writes one interaction.
  - A minor cannot message an adult they have no mutual relationship with.
  - A minor cannot insert a live stream.
  - There's no client insert on ledger_entries or creator_terms.

## Step 2 — Expo app (builder, runs after Step 1's types exist)
Replace the Next.js files in the repo root with `bunx create-expo-app@latest --template default`: TypeScript strict, expo-router.
- **Tooling:** ESLint (`expo lint`) and Prettier; `.env.example` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `.gitignore`.
- **Scripts:** `typecheck`, `lint`, `format`, `db:types` (writes `lib/db/types.ts`, committed), `db:test`.
- **`lib/supabase.ts`:** the client with the expo-sqlite localStorage session store, `autoRefreshToken`, and an AppState listener.
- **`app/_layout.tsx`:** a session gate. Routes are `(auth)` or `(app)`; `(app)` redirects to onboarding when there's no profile.
- **`(auth)/sign-in.tsx`:** email → OTP code → verify. On signup, the DOB is required and passed as `options.data.date_of_birth`.
- **`(app)/onboarding.tsx`:** username, display name, and bio. Username uniqueness errors surface from the citext unique index.
- **`(app)/profile.tsx` and `profile/edit.tsx`:** view and edit your own profile. **No counts anywhere.**
- **`(app)/new.tsx`:** pick an image (expo-image-picker) → upload to the Storage `media` bucket at `{uid}/…` → create the `media_assets` row, the `posts` row (caption, visibility selector), and the `post_media` row.
- **`(app)/index.tsx` (feed):** FlashList, reverse-chronological, cursor pagination on `created_at`, pull to refresh.
- **Like:** optimistic toggle with rollback on error. Show the heart state only, no public counts.
- **`README.md`:** from scratch — `bun install`, `bunx supabase start`, `db reset`, env setup, `bunx expo start`. Include the phone note: set the Supabase URL to the Mac's LAN IP, and read OTP codes from Mailpit at `:54324`.

## Execution
Step 1 → Forge. Step 2 → builder, once the types land. Then the reviewer reads the full diff.

Logical commits: remove Next.js; DB split; RLS + tests; Expo scaffold; auth; profile; post; feed + like. Push to `origin/main`. Then **stop**, per §9.

## Verification
1. `bunx supabase db reset`: zero errors.
2. `bunx supabase test db`: all pass. Quote the counts.
3. `bun run typecheck` and `bun run lint`: clean.
4. **This Mac has no Xcode or simulators.** I verify with `bunx expo start --web` plus an Interceptor walk: sign up with OTP from Mailpit, onboard, post an image, see it in the feed, like it, reload, and the like persists.
5. Colin runs the physical-device check (the brief's definition of done) through Expo Go, following the README. I'll say plainly that I didn't run it.
