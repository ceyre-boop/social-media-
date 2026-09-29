# Smiley — Claude Code Session Brief

**Read this fully before writing any code.**

Project: Smiley — a social platform (short video, live, stories, posts, DMs,
creator gifting) built as an alternative to TikTok. Solo developer: Colin.
Status: design complete, **zero code written**. This session starts the build.

Companion documents in this workspace:
- `schema.sql` — Postgres schema (needs the amendments in §4 below)
- `community-policy.md` — content policy and safety rules
- `cost-model.md` — infrastructure costs and the R2 decision
- `project-handoff.md` — business/risk context, not needed for coding

---

## 1. The thesis (read this — it constrains technical choices)

Smiley optimizes for **joy and genuine connection** instead of attention.

Every incumbent maximizes time-on-app. Because outrage holds attention better than
delight, every one of them drifts cruel — not by intent, but by objective function.
Smiley's premise: optimize for whether people *return* and whether they leave
*feeling better*, and you get a structurally different platform from the same
technology.

Three consequences that show up in code:

1. **Sentiment is never an input to ranking or enforcement.** Not now, not later,
   not as a "positivity booster." A platform that filters negative sentiment
   silences people having a hard day, and "a safe place to fail" is incompatible
   with that. The only line is *cruelty*, which is a behavior with a target, not a
   mood.
2. **Relationships are earned by returning, not declared by tapping.** There is no
   follow button. See §4.
3. **Transparency is structural, not promised.** Append-only ledger, immutable
   versioned payout terms, and no reach limitation without a stored
   plain-language explanation.

---

## 2. Locked stack decisions — do not re-litigate

| Layer | Decision | Why |
|---|---|---|
| Client | React Native + Expo (dev client, TypeScript) | One codebase; native modules still possible |
| Backend | Supabase (Postgres, Auth, Realtime, RLS) | RLS is the authorization layer |
| Authorization | **Postgres RLS, not application logic** | API can be hit directly; app-layer checks are bypassable |
| VOD video | ffmpeg → HLS → Cloudflare R2 | R2 has zero egress. Managed per-minute providers cost ~30x |
| Live | Cloudflare Stream Live, migrate to self-hosted at $300/mo | |
| Live interactive layer | LiveKit — host/co-host only, never mass viewers | Its bandwidth pricing is bad at scale |
| Payments | Stripe + Stripe Connect Express | |
| Coin purchase | Web checkout link-out, not IAP | US court orders currently mean 0% platform commission |
| Money math | Integers only — coins as int, USD as int cents | Never floats, anywhere, for any reason |

**If you think a managed video provider would be simpler: yes, and it costs ~30x.
That decision is made. Do not substitute it.**

---

## 3. Product surface (eventual, not this session)

Short video feed ("reels"), live streaming with gifting, stories (24h), posts, DMs,
creator profiles, coin purchase and creator payout.

---

## 4. The relationship model — schema amendment required

**This changes `schema.sql`. Apply it as migration 002.**

There is no follow button. The follow button is the fake-friend primitive: one tap,
free, instant, permanent, meaningless thereafter. Every downstream problem — bought
followers, follow-for-follow, engagement pods — exists because the relationship is
a single cheap action.

Relationship state is **derived from behavior**, never inserted by a user action:

| State | Earned by |
|---|---|
| `seen` | watched/viewed once |
| `returning` | came back to this specific creator |
| `regular` | returned N times across N distinct weeks |
| `mutual` | both directions are `regular` |

Botting this costs real time per fake relationship, and the cost scales with how
authentic it must look.

### Required schema changes

1. **Drop the `follows` table** as a user-writable relation. Replace with:

```sql
-- Append-only record of actual interaction. Written by the app, never by users.
create table interactions (
  id           bigserial primary key,
  actor_id     uuid not null references users(id) on delete cascade,
  subject_id   uuid not null references users(id) on delete cascade, -- the creator
  post_id      uuid references posts(id) on delete cascade,
  stream_id    uuid references live_streams(id) on delete cascade,
  kind         text not null,  -- 'view'|'complete'|'like'|'comment'|'share'|'profile_visit'|'stream_join'
  occurred_at  timestamptz not null default now(),
  check (actor_id <> subject_id)
);
create index interactions_pair_idx on interactions(actor_id, subject_id, occurred_at desc);
create index interactions_subject_idx on interactions(subject_id, occurred_at desc);

-- Derived relationship state. Recomputed by a scheduled job, never user-written.
create table relationships (
  actor_id          uuid not null references users(id) on delete cascade,
  subject_id        uuid not null references users(id) on delete cascade,
  state             text not null default 'seen',  -- seen|returning|regular
  distinct_weeks    integer not null default 0,
  interaction_count integer not null default 0,
  first_seen_at     timestamptz not null,
  last_seen_at      timestamptz not null,
  primary key (actor_id, subject_id)
);
create index relationships_subject_idx on relationships(subject_id, state);
```

2. **Remove `follower_count` and `following_count` from `profiles`.** They do not
   exist as public numbers anywhere in the product. Creators see real numbers on a
   private dashboard (§5); nothing public displays a count.

3. **Ranking weights repeat interaction from the same person over volume.** One
   person interacting 20 times over eight weeks is connection. Twenty people
   interacting once each is reach. Outrage produces wide/shallow/one-time from
   strangers; connection produces narrow/deep/repeated from the same people. The
   interaction graph's *shape* distinguishes them — no sentiment analysis needed.

### Discovery (design note, not this session)

Home = only real relationships. Discovery = a deliberate, finite side door you
visit and leave. New creators start in small rooms (~50 people); room size grows on
**return rate**, not on view count.

---

## 5. Creator dashboard (design note, not this session)

Private, creator-only. Its purpose is **gratitude, not metrics** — it helps a
creator know who to thank.

- Shows **people, not aggregates**: who showed up, how long they've been around,
  who came back after a gap.
- **Presence, never spend.** Never rank or sort people by gifting. A top-gifter
  leaderboard turns fans into a spending ladder and is one of the most predatory
  mechanics on TikTok. Gifting data lives in the ledger for accounting and is
  absent from the relationship view.
- At scale, surfaces *moments* (a one-year mark, a return after a month away, a
  first-timer who stayed the whole stream) rather than an unusable full list.

---

## 6. Hard invariants — violating any of these is a bug, not a tradeoff

1. **No sentiment analysis in ranking or enforcement.** It may not appear in the
   ranker's feature set at all. If it's available, someone optimizing a metric will
   eventually use it.
2. **No reach limitation without a stored plain-language explanation** in
   `reach_events`, readable by the affected creator. If the sentence can't be
   written, the limit isn't applied.
3. **The ledger is append-only.** `ledger_entries` has UPDATE/DELETE rules that
   discard writes. Corrections are new reversing entries. Balances are derived by
   view, never stored.
4. **Creator terms are immutable and versioned.** Rate changes create a new row
   with a future effective date. Gifts snapshot the exact `terms_id` that priced
   them.
5. **Money is integers.** Coins as `integer`, USD as `integer` cents.
6. **Coins are closed-loop.** Purchasable, giftable, cashable out by creators.
   Never user-to-user transferable, never refundable for cash, never wagered.
   Breaking this may constitute money transmission, which is criminally penalized
   without a license.
7. **No public follower/following counts anywhere.**
8. **Age rules are database constraints, not app logic** (§7).

---

## 7. Age and safety rules — enforce in RLS, not in the client

These are the most important rules in the codebase.

| Rule | Enforcement |
|---|---|
| Live streaming requires 18+ verified | RLS on `live_streams` INSERT |
| An adult may not DM an unconnected minor | RLS on `messages` INSERT, checked against both users' `is_adult` |
| A minor may DM only mutual relationships | RLS on `messages` INSERT |
| Receiving gifts requires 18+ verified + payout KYC | RLS on `gift_events` INSERT |
| Message requests never expose body content | Separate table/view; body withheld until accepted |

`users.is_adult` is a generated column off `date_of_birth` — it already exists in
`schema.sql`. Use it.

**Never store identity documents.** Verification providers return a boolean plus a
reference token. Persist `age_verified`, `verified_at`, `provider_ref`. Nothing
else.

---

## 8. IN SCOPE FOR THIS SESSION

Build a **vertical slice**: signup → profile → post an image → see a feed → like it.
No video, no money, no live, no DMs.

### Build order

1. **Repo initialization**
   - Expo app, TypeScript strict mode, file-based routing (expo-router)
   - ESLint + Prettier, `.env.example`, `.gitignore`
   - `README.md` with local setup steps

2. **Supabase project structure**
   - `supabase/` directory, local dev via CLI
   - Migration `001_initial_schema.sql` — from `schema.sql` as written
   - Migration `002_relationship_model.sql` — the §4 amendments
   - Migration `003_rls_policies.sql` — see below
   - Seed file with 3-5 test users and sample posts

3. **RLS policies — the core of this session**
   - Deny-by-default on every table
   - `profiles`: public read, self-write only
   - `posts`: read per `visibility` column and relationship state; author-write only
   - `likes`, `comments`: authenticated write, author-delete
   - `interactions`: service-role insert only — **never client-writable**
   - `relationships`: read-only to the actor and subject; written only by the
     recompute job
   - `ledger_entries`, `creator_terms`: no client write path at all
   - `messages`: the §7 age rules, even though DMs aren't built this session —
     write the policies now so the table can never be used unsafely
   - Write a test file proving each policy: user A cannot write user B's profile,
     cannot insert interactions, cannot read a `private` post

4. **Generated types**
   - `supabase gen types typescript` wired into a script, output committed

5. **Auth flow**
   - Email + OTP (phone later)
   - Signup collects `date_of_birth` — required, used for `is_adult`
   - Session persistence, protected routes

6. **Profile**
   - Create on first login: username (unique, case-insensitive), display name, bio
   - View and edit own profile
   - **No follower counts in the UI**

7. **Create post**
   - Image only this session
   - Upload to Supabase Storage (R2 pipeline comes later)
   - Caption, visibility selector

8. **Feed**
   - Reverse-chronological, no ranking algorithm yet
   - FlashList with recycling
   - Pull to refresh, pagination

9. **Like**
   - Optimistic UI
   - Writes both a `likes` row and an `interactions` row

### Definition of done

On a physical device: sign up, create a profile, post an image, see it in the feed,
like it. RLS tests pass. `npm run typecheck` and lint are clean. README lets
someone else run it from scratch.

---

## 9. OUT OF SCOPE — STOP WHEN THE ABOVE IS DONE

Do not start any of these, even if they seem like a natural next step. Stop, report,
and let Colin decide the next milestone.

- ❌ **Video** — upload, playback, the ffmpeg/R2 pipeline, the native player module
- ❌ **Live streaming** — Cloudflare Stream, LiveKit, chat, gifting
- ❌ **Money** — coins, Stripe, gifts, payouts, anything touching the ledger
- ❌ **DMs** — the tables and RLS policies get written, the feature does not get built
- ❌ **Moderation** — classifiers, the four-tier pipeline, report queues
- ❌ **Ranking** — feed stays chronological
- ❌ **Relationship recompute job** — tables exist, the job comes later
- ❌ **Creator dashboard**
- ❌ **Stories**
- ❌ **Push notifications**
- ❌ **Age verification provider integration** — the column exists, the flow doesn't
- ❌ **App Store submission**

**Why this is scoped so tightly:** a social platform fails by building everything
halfway. One complete, tested loop on a real device beats six half-features. The
next milestone is chosen after this one works.

---

## 10. Working notes

- **Ask before adding a dependency** that isn't Expo, Supabase, FlashList, or
  standard tooling.
- **RLS tests are not optional.** They're the deliverable that makes everything
  later safe.
- **If something in `schema.sql` seems wrong, say so** rather than silently
  changing it. It encodes product decisions that aren't always obvious from the
  SQL.
- **Commit in logical units** with clear messages. Colin will review the diff.
- **Flag scope creep out loud.** If a task seems to require something from §9,
  stop and report instead of expanding.
