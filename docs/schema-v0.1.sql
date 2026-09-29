-- ============================================================================
-- SOCIAL PLATFORM — CORE SCHEMA v0.1  (ORIGINAL, AS PASTED — DOES NOT APPLY)
-- Kept for reference. The corrected, runnable version is
-- supabase/migrations/*_core.sql.
-- Postgres 15+ / Supabase flavored
--
-- Design principles baked into this schema:
--   1. Money is double-entry and append-only. Nothing is ever UPDATEd.
--   2. Creator terms are versioned and immutable. No retroactive rate changes.
--   3. Ranking decisions are logged and creator-visible. No silent suppression.
--   4. Soft-delete everywhere a user might want their data back.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ENUMS
create type account_status   as enum ('active','suspended','deactivated','banned');
create type post_kind        as enum ('post','reel','story');
create type media_kind       as enum ('image','video','audio');
create type media_status     as enum ('uploading','processing','ready','failed');
create type visibility       as enum ('public','followers','friends','private');
create type friend_status    as enum ('pending','accepted','declined','blocked');
create type stream_status    as enum ('scheduled','live','ended','errored');
create type ledger_side      as enum ('debit','credit');
create type payout_status    as enum ('pending','processing','paid','failed','reversed');
create type report_reason    as enum ('spam','harassment','nudity','violence','csam',
                                      'self_harm','illegal','impersonation','ip','other');
create type report_status    as enum ('open','triaging','actioned','dismissed','appealed');
create type moderation_action as enum ('none','warn','age_gate','limit_reach','remove_content',
                                       'suspend','ban','law_enforcement_referral');
create type reach_reason     as enum ('normal','new_account','low_quality_signal','duplicate_content',
                                      'moderation_limit','viewer_preference','rate_limited','boosted');

-- IDENTITY
create table users (
  id              uuid primary key default gen_random_uuid(),
  email           citext unique,
  phone           text unique,
  status          account_status not null default 'active',
  date_of_birth   date,
  is_adult        boolean generated always as (
                    date_of_birth is not null
                    and date_of_birth <= (current_date - interval '18 years')
                  ) stored,
  country_code    char(2),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table profiles (
  user_id         uuid primary key references users(id) on delete cascade,
  username        citext unique not null,
  display_name    text,
  bio             text check (length(bio) <= 500),
  avatar_media_id uuid,
  link_url        text,
  is_creator      boolean not null default false,
  is_verified     boolean not null default false,
  follower_count  bigint not null default 0,
  following_count bigint not null default 0,
  post_count      bigint not null default 0,
  updated_at      timestamptz not null default now()
);
create index profiles_username_trgm on profiles using gin (username gin_trgm_ops);

-- GRAPH
create table follows (
  follower_id  uuid not null references users(id) on delete cascade,
  followee_id  uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows(followee_id, created_at desc);

create table friendships (
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status       friend_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- MEDIA
create table media_assets (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references users(id) on delete cascade,
  kind            media_kind not null,
  status          media_status not null default 'uploading',
  provider        text not null,
  provider_asset_id text,
  playback_url    text,
  thumbnail_url   text,
  duration_ms     integer,
  width           integer,
  height          integer,
  bytes           bigint,
  content_hash    text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index media_owner_idx on media_assets(owner_id, created_at desc);
create index media_hash_idx  on media_assets(content_hash) where content_hash is not null;

-- CONTENT
create table posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references users(id) on delete cascade,
  kind          post_kind not null,
  caption       text check (length(caption) <= 2200),
  visibility    visibility not null default 'public',
  expires_at    timestamptz,
  allow_comments boolean not null default true,
  allow_gifts    boolean not null default true,
  like_count    bigint not null default 0,
  comment_count bigint not null default 0,
  view_count    bigint not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index posts_author_idx  on posts(author_id, created_at desc) where deleted_at is null;
create index posts_feed_idx    on posts(created_at desc)
  where deleted_at is null and visibility = 'public';
create index posts_stories_idx on posts(author_id, expires_at)
  where kind = 'story' and deleted_at is null;

create table post_media (
  post_id   uuid not null references posts(id) on delete cascade,
  media_id  uuid not null references media_assets(id) on delete restrict,
  position  smallint not null default 0,
  primary key (post_id, media_id)
);

create table likes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references users(id) on delete cascade,
  parent_id  uuid references comments(id) on delete cascade,
  body       text not null check (length(body) between 1 and 2200),
  like_count bigint not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_post_idx on comments(post_id, created_at desc) where deleted_at is null;

-- ALGORITHMIC TRANSPARENCY
create table reach_events (
  id          bigserial primary key,
  post_id     uuid not null references posts(id) on delete cascade,
  reason      reach_reason not null,
  multiplier  numeric(4,3) not null default 1.000,
  explanation text not null,
  actor_id    uuid references users(id),
  created_at  timestamptz not null default now()
);
create index reach_post_idx on reach_events(post_id, created_at desc);

create table post_daily_stats (
  post_id     uuid not null references posts(id) on delete cascade,
  day         date not null,
  impressions bigint not null default 0,
  reached_users bigint not null default 0,
  likes       bigint not null default 0,
  comments    bigint not null default 0,
  shares      bigint not null default 0,
  watch_ms    bigint not null default 0,
  primary key (post_id, day)
);

-- MESSAGING
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  is_group    boolean not null default false,
  title       text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  last_message_at timestamptz
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted_until     timestamptz,
  left_at         timestamptz,
  primary key (conversation_id, user_id)
);
create index conv_members_user_idx on conversation_members(user_id) where left_at is null;

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references users(id) on delete cascade,
  body            text,
  media_id        uuid references media_assets(id),
  shared_post_id  uuid references posts(id) on delete set null,
  reply_to_id     uuid references messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  check (body is not null or media_id is not null or shared_post_id is not null)
);
create index messages_conv_idx on messages(conversation_id, created_at desc);

-- LIVE STREAMING
create table live_streams (
  id             uuid primary key default gen_random_uuid(),
  host_id        uuid not null references users(id) on delete cascade,
  title          text,
  status         stream_status not null default 'scheduled',
  provider       text not null,
  provider_room_id text,
  ingest_url     text,
  playback_url   text,
  recording_media_id uuid references media_assets(id),
  is_adult_only  boolean not null default false,
  scheduled_for  timestamptz,
  started_at     timestamptz,
  ended_at       timestamptz,
  peak_viewers   integer not null default 0,
  total_viewers  bigint not null default 0,
  created_at     timestamptz not null default now()
);
create index live_active_idx on live_streams(status, started_at desc) where status = 'live';
create index live_host_idx   on live_streams(host_id, started_at desc);

create table live_participants (
  stream_id   uuid not null references live_streams(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null default 'viewer',
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  watch_ms    bigint not null default 0,
  primary key (stream_id, user_id, joined_at)
);

create table live_chat_messages (
  id         bigserial primary key,
  stream_id  uuid not null references live_streams(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  body       text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index live_chat_idx on live_chat_messages(stream_id, created_at desc);

-- MONEY — DOUBLE ENTRY, APPEND ONLY
-- Coins are a closed-loop virtual currency. Non-transferable between users,
-- non-refundable, redeemable by creators only. Keep it that way — the moment
-- users can send coins to each other, you are a money transmitter.
create table coin_products (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique not null,
  coins       integer not null check (coins > 0),
  price_cents integer not null check (price_cents > 0),
  currency    char(3) not null default 'USD',
  active      boolean not null default true
);

create table coin_purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete restrict,
  product_id      uuid not null references coin_products(id),
  coins           integer not null,
  gross_cents     integer not null,
  platform_fee_cents integer not null default 0,
  processor       text not null,
  processor_txn_id text unique,
  created_at      timestamptz not null default now()
);

-- kind: 'user_coins' | 'creator_earnings' | 'platform_revenue'
--     | 'processor_fees' | 'coin_issuance' | 'payouts_payable'
create table ledger_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references users(id) on delete restrict,
  kind       text not null,
  currency   text not null default 'COIN',
  created_at timestamptz not null default now(),
  unique (owner_id, kind, currency)
);

create table ledger_transactions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  reference_id uuid,
  memo        text,
  created_at  timestamptz not null default now()
);

create table ledger_entries (
  id              bigserial primary key,
  transaction_id  uuid not null references ledger_transactions(id) on delete restrict,
  account_id      uuid not null references ledger_accounts(id) on delete restrict,
  side            ledger_side not null,
  amount          bigint not null check (amount > 0),
  currency        text not null,
  created_at      timestamptz not null default now()
);
create index ledger_account_idx on ledger_entries(account_id, created_at desc);
create index ledger_txn_idx     on ledger_entries(transaction_id);

create rule ledger_entries_no_update as on update to ledger_entries do instead nothing;
create rule ledger_entries_no_delete as on delete to ledger_entries do instead nothing;

create view ledger_balances as
select account_id,
       currency,
       sum(case when side = 'credit' then amount else -amount end) as balance
from ledger_entries
group by account_id, currency;

-- CREATOR TERMS
create table creator_terms (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade,
  version           integer not null,
  creator_share_bps integer not null check (creator_share_bps between 0 and 10000),
  min_payout_cents  integer not null default 2000,
  payout_delay_days integer not null default 7,
  effective_from    timestamptz not null,
  superseded_at     timestamptz,
  summary           text not null,
  created_at        timestamptz not null default now(),
  unique (user_id, version)
);

create table gift_catalog (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  coins      integer not null check (coins > 0),
  animation_url text,
  active     boolean not null default true
);

create table gift_events (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references users(id) on delete restrict,
  recipient_id  uuid not null references users(id) on delete restrict,
  gift_id       uuid not null references gift_catalog(id),
  quantity      integer not null default 1 check (quantity > 0),
  coins_total   integer not null,
  stream_id     uuid references live_streams(id) on delete set null,
  post_id       uuid references posts(id) on delete set null,
  terms_id      uuid not null references creator_terms(id),
  gross_cents            integer not null,
  app_store_fee_cents    integer not null,
  platform_fee_cents     integer not null,
  creator_net_cents      integer not null,
  ledger_transaction_id  uuid references ledger_transactions(id),
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (gross_cents = app_store_fee_cents + platform_fee_cents + creator_net_cents)
);
create index gifts_recipient_idx on gift_events(recipient_id, created_at desc);
create index gifts_stream_idx    on gift_events(stream_id, created_at desc);

create table payout_accounts (
  user_id            uuid primary key references users(id) on delete cascade,
  processor          text not null default 'stripe',
  processor_account_id text unique,
  kyc_status         text not null default 'unverified',
  payouts_enabled    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table payouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete restrict,
  amount_cents      integer not null check (amount_cents > 0),
  currency          char(3) not null default 'USD',
  status            payout_status not null default 'pending',
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  processor_transfer_id text unique,
  failure_reason    text,
  ledger_transaction_id uuid references ledger_transactions(id),
  requested_at      timestamptz not null default now(),
  paid_at           timestamptz
);
create index payouts_user_idx on payouts(user_id, requested_at desc);

-- TRUST & SAFETY
create table reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references users(id) on delete set null,
  target_user_id uuid references users(id) on delete cascade,
  target_post_id uuid references posts(id) on delete cascade,
  target_message_id uuid references messages(id) on delete cascade,
  target_stream_id  uuid references live_streams(id) on delete cascade,
  reason         report_reason not null,
  detail         text,
  status         report_status not null default 'open',
  priority       smallint not null default 0,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index reports_queue_idx on reports(status, priority desc, created_at)
  where status in ('open','triaging');

create table moderation_decisions (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references reports(id) on delete set null,
  subject_user_id uuid not null references users(id) on delete cascade,
  action      moderation_action not null,
  rationale   text not null,
  policy_ref  text,
  moderator_id uuid references users(id),
  is_automated boolean not null default false,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table appeals (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references moderation_decisions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  statement   text not null,
  due_by      timestamptz not null default (now() + interval '72 hours'),
  outcome     text,
  reviewer_id uuid references users(id),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index appeals_due_idx on appeals(due_by) where resolved_at is null;

-- NOTIFICATIONS
create table devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  platform    text not null,
  push_token  text not null,
  last_seen_at timestamptz not null default now(),
  unique (user_id, push_token)
);

create table notifications (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null,
  actor_id    uuid references users(id) on delete cascade,
  post_id     uuid references posts(id) on delete cascade,
  stream_id   uuid references live_streams(id) on delete cascade,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc)
  where read_at is null;

-- SEED: default creator terms
insert into creator_terms (user_id, version, creator_share_bps, min_payout_cents,
                           payout_delay_days, effective_from, summary)
values (
  null, 1, 7000, 2000, 7, now(),
  'You keep 70% of what remains after Apple or Google takes their 30% app store '
  'fee, which we do not control and cannot waive. Every gift you receive shows '
  'all three numbers: what the sender paid, what the app store took, and what '
  'reached you. Payouts run weekly once your balance clears $20. These terms '
  'cannot be changed retroactively — a rate change creates a new version with a '
  'future effective date, and everything earned before then settles at the old rate.'
);
