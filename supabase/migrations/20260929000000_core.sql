-- ============================================================================
-- SOCIAL PLATFORM — CORE SCHEMA v0.1  (CORRECTED, RUNNABLE)
-- Source: docs/schema-v0.1.sql. Policy: "# Community Policy v0.md",
-- "# Infrastructure Cost Model.md".
-- Postgres 15+ / Supabase flavored
--
-- Design principles baked into this schema:
--   1. Money is double-entry and append-only. Nothing is ever UPDATEd.
--   2. Creator terms are versioned and immutable. No retroactive rate changes.
--   3. Ranking decisions are logged and creator-visible. No silent suppression.
--   4. Soft-delete everywhere a user might want their data back.
--
-- Enforcement (added in the corrected version):
--   - Append-only tables raise on UPDATE/DELETE/TRUNCATE (triggers, not rules —
--     a `do instead nothing` rule silently swallows the write).
--   - Every ledger transaction balances per currency, checked at COMMIT.
--   - security definer posting functions are the ONLY write path for money;
--     clients have no INSERT/UPDATE/DELETE privilege on any money table.
--   - RLS is enabled on every table in public.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm"  with schema extensions;
create extension if not exists "citext"   with schema extensions;

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
-- Policy "Reach and ranking": only disclosed, permitted reasons exist.
-- low_quality_signal / viewer_preference / rate_limited are deliberately absent.
create type reach_reason     as enum ('normal','new_account','duplicate_content',
                                      'engagement_manipulation','moderation_limit','boosted');
-- Policy "The four tiers". Classifier is out of scope; the column is nullable.
create type moderation_tier  as enum ('green','yellow','orange','red');

-- IDENTITY
-- users.id IS the auth user id. Rows are created by the on_auth_user_created
-- trigger below; clients never insert here.
create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           extensions.citext unique,
  phone           text unique,
  status          account_status not null default 'active',
  date_of_birth   date,
  -- is_adult is NOT a generated column: current_date is not immutable.
  -- Use public.is_adult(uid) instead.
  -- Age verification: we persist the boolean + provider reference only.
  -- Identity documents are never stored (policy "Age verification").
  age_verified         boolean not null default false,
  age_verified_at      timestamptz,
  age_verification_ref text,
  app_role        text not null default 'user'
                    check (app_role in ('user','moderator','admin')),
  country_code    char(2),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table profiles (
  user_id         uuid primary key references users(id) on delete cascade,
  username        extensions.citext unique not null,
  display_name    text,
  bio             text check (length(bio) <= 500),
  avatar_media_id uuid,  -- FK to media_assets added after that table exists
  link_url        text,
  is_creator      boolean not null default false,
  is_verified     boolean not null default false,
  follower_count  bigint not null default 0,
  following_count bigint not null default 0,
  post_count      bigint not null default 0,
  updated_at      timestamptz not null default now()
);
create index profiles_username_trgm on profiles using gin (username extensions.gin_trgm_ops);

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
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
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

alter table profiles
  add constraint profiles_avatar_media_id_fkey
  foreign key (avatar_media_id) references media_assets(id) on delete set null;

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
  tier       moderation_tier,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_post_idx on comments(post_id, created_at desc) where deleted_at is null;

-- ALGORITHMIC TRANSPARENCY
-- Every limitation writes a row with a plain-language explanation and, for
-- limits, a duration (expires_at). "If we can't write the sentence, we don't
-- apply the limit."
create table reach_events (
  id          bigserial primary key,
  post_id     uuid not null references posts(id) on delete cascade,
  reason      reach_reason not null,
  multiplier  numeric(4,3) not null default 1.000,
  explanation text not null check (length(btrim(explanation)) > 0),
  actor_id    uuid references users(id),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- Account age ramp is capped at 14 days.
  check (reason <> 'new_account'
         or (expires_at is not null and expires_at <= created_at + interval '14 days'))
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
  tier            moderation_tier,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  check (body is not null or media_id is not null or shared_post_id is not null)
);
create index messages_conv_idx on messages(conversation_id, created_at desc);

-- LIVE STREAMING
-- Live is 18+ verified only (policy "Age verification"); enforced by the
-- live_streams_require_verified_adult trigger below.
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
  chat_strictness text not null default 'standard'
                   check (chat_strictness in ('open','standard','protected')),
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
  tier       moderation_tier,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index live_chat_idx on live_chat_messages(stream_id, created_at desc);

-- Trusted Circles: regulars a host pre-approves to bypass YELLOW.
create table stream_trusted_members (
  host_id    uuid not null references users(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, user_id),
  check (host_id <> user_id)
);

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
-- owner_id is null for platform/system accounts; nulls not distinct keeps
-- those unique too.
create table ledger_accounts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references users(id) on delete restrict,
  kind       text not null check (kind in ('user_coins','creator_earnings','platform_revenue',
                                           'processor_fees','coin_issuance','payouts_payable')),
  currency   text not null default 'COIN',
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, kind, currency)
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

-- security_invoker: the view is filtered by the caller's RLS on ledger_entries.
create view ledger_balances with (security_invoker = true) as
select account_id,
       currency,
       sum(case when side = 'credit' then amount else -amount end) as balance
from ledger_entries
group by account_id, currency;

-- CREATOR TERMS
-- The only permitted UPDATE sets superseded_at from null to a value
-- (creator_terms_guard_mutation). One active (superseded_at is null) row per
-- user_id; the null user_id row is the platform default.
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
  unique nulls not distinct (user_id, version)
);
create unique index creator_terms_one_active on creator_terms (user_id) nulls not distinct
  where superseded_at is null;

create table gift_catalog (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  coins      integer not null check (coins > 0),
  animation_url text,
  active     boolean not null default true
);

-- stream_id/post_id are ON DELETE RESTRICT (not SET NULL as in v0.1): SET NULL
-- would be an UPDATE on an append-only table and would break the exactly-one
-- context check. Posts are soft-deleted, so this never blocks normal use.
create table gift_events (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references users(id) on delete restrict,
  recipient_id  uuid not null references users(id) on delete restrict,
  gift_id       uuid not null references gift_catalog(id),
  quantity      integer not null default 1 check (quantity > 0),
  coins_total   integer not null,
  stream_id     uuid references live_streams(id) on delete restrict,
  post_id       uuid references posts(id) on delete restrict,
  terms_id      uuid not null references creator_terms(id),
  gross_cents            integer not null,
  app_store_fee_cents    integer not null,
  platform_fee_cents     integer not null,
  creator_net_cents      integer not null,
  ledger_transaction_id  uuid references ledger_transactions(id),
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (num_nonnulls(stream_id, post_id) = 1),
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
  resolved_at    timestamptz,
  check (num_nonnulls(target_user_id, target_post_id, target_message_id, target_stream_id) = 1)
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

-- ============================================================================
-- HELPER FUNCTIONS
-- security definer so RLS policies can consult other RLS-protected tables
-- without recursion. All pin search_path.
-- ============================================================================

-- 18+ by self-declared DOB. Null DOB is not adult.
create function public.is_adult(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  dob date;
begin
  select date_of_birth into dob from public.users where id = uid;
  return dob is not null and dob <= current_date - interval '18 years';
end $$;

create function public.is_age_verified_adult(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return public.is_adult(uid)
     and exists (select 1 from public.users where id = uid and age_verified);
end $$;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
end $$;

-- Active (not left) member of a conversation.
create function public.is_member(conv uuid, uid uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return uid is not null and exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = uid and left_at is null);
end $$;

create function public.follows_user(follower uuid, followee uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return follower is not null and followee is not null and exists (
    select 1 from public.follows where follower_id = follower and followee_id = followee);
end $$;

create function public.are_friends(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return a is not null and b is not null and exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)));
end $$;

create function public.is_moderator() returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return exists (
    select 1 from public.users
    where id = auth.uid() and app_role in ('moderator','admin'));
end $$;

-- Post visibility, single source of truth for posts and everything hanging
-- off a post (likes, comments, post_media).
create function public.can_view_post(p_post uuid, p_viewer uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  p public.posts%rowtype;
begin
  select * into p from public.posts where id = p_post;
  if not found then
    return false;
  end if;
  if p_viewer is not null and p.author_id = p_viewer then
    return true;  -- authors always see their own posts, including deleted/expired
  end if;
  return p.deleted_at is null
     and (p.expires_at is null or p.expires_at > now())
     and not public.is_blocked_between(p.author_id, p_viewer)
     and (p.visibility = 'public'
          or (p.visibility = 'followers' and public.follows_user(p_viewer, p.author_id))
          or (p.visibility = 'friends'   and public.are_friends(p_viewer, p.author_id)));
     -- 'private': author only, handled above.
end $$;

-- DM permission (policy "DMs"). Never across a block. Then:
--   - if either side is a minor: mutual follow is the ONLY path;
--   - two adults: accepted friends, mutual follow, or both age-verified.
-- Hence an adult and an unconnected minor can never DM.
create function public.can_dm(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  mutual_follow boolean;
begin
  if a is null or b is null or a = b or public.is_blocked_between(a, b) then
    return false;
  end if;
  mutual_follow := public.follows_user(a, b) and public.follows_user(b, a);
  if not (public.is_adult(a) and public.is_adult(b)) then
    return mutual_follow;
  end if;
  return mutual_follow
      or public.are_friends(a, b)
      or (public.is_age_verified_adult(a) and public.is_age_verified_adult(b));
end $$;

-- ============================================================================
-- AUTH → users/profiles
-- ============================================================================
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  local_part text;
begin
  local_part := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'user');
  insert into public.users (id, email, phone, date_of_birth)
  values (new.id, new.email, new.phone,
          nullif(new.raw_user_meta_data->>'date_of_birth', '')::date);
  insert into public.profiles (user_id, username, display_name)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                   local_part || '_' || substr(md5(random()::text), 1, 6)),
          nullif(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- COUNTER TRIGGERS (security definer: they update rows the actor can't)
-- ============================================================================
create function public.maintain_follow_counts() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count  = follower_count + 1  where user_id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where user_id = new.follower_id;
    return new;
  end if;
  -- DELETE
  update public.profiles set follower_count  = greatest(follower_count - 1, 0)  where user_id = old.followee_id;
  update public.profiles set following_count = greatest(following_count - 1, 0) where user_id = old.follower_id;
  return old;
end $$;
create trigger follows_counts after insert or delete on follows
  for each row execute function public.maintain_follow_counts();

-- post_count counts live (not soft-deleted) posts.
create function public.maintain_post_count() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.profiles set post_count = post_count + 1 where user_id = new.author_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.profiles set post_count = greatest(post_count - 1, 0) where user_id = old.author_id;
    end if;
    return old;
  end if;
  -- UPDATE OF deleted_at
  if old.deleted_at is null and new.deleted_at is not null then
    update public.profiles set post_count = greatest(post_count - 1, 0) where user_id = new.author_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.profiles set post_count = post_count + 1 where user_id = new.author_id;
  end if;  -- otherwise deleted_at state unchanged: nothing to do
  return new;
end $$;
create trigger posts_count after insert or delete or update of deleted_at on posts
  for each row execute function public.maintain_post_count();

create function public.maintain_like_count() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  return old;
end $$;
create trigger likes_count after insert or delete on likes
  for each row execute function public.maintain_like_count();

-- comment_count counts live (not soft-deleted) comments.
create function public.maintain_comment_count() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return new;
end $$;
create trigger comments_count after insert or delete or update of deleted_at on comments
  for each row execute function public.maintain_comment_count();

-- ============================================================================
-- CHILD-SAFETY ADMISSION TRIGGERS
-- ============================================================================
create function public.require_verified_adult_host() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_age_verified_adult(new.host_id) then
    raise exception 'live_requires_verified_adult' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger live_streams_require_verified_adult
  before insert or update of host_id on live_streams
  for each row execute function public.require_verified_adult_host();

-- A message must be permitted between the sender and EVERY other active
-- member (group chats included).
create function public.require_dm_permission() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  other_member uuid;
begin
  if not public.is_member(new.conversation_id, new.sender_id) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  for other_member in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and left_at is null and user_id <> new.sender_id
  loop
    if not public.can_dm(new.sender_id, other_member) then
      raise exception 'dm_not_allowed' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger messages_require_dm_permission
  before insert on messages
  for each row execute function public.require_dm_permission();

-- ============================================================================
-- APPEND-ONLY ENFORCEMENT
-- Replaces the v0.1 `do instead nothing` rules, which silently discarded
-- writes. These raise, so a bug that tries to mutate money fails loudly.
-- ============================================================================
create function public.reject_append_only_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'P0001';
end $$;

create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function public.reject_append_only_mutation();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function public.reject_append_only_mutation();
create trigger ledger_transactions_append_only before update or delete on ledger_transactions
  for each row execute function public.reject_append_only_mutation();
create trigger ledger_transactions_no_truncate before truncate on ledger_transactions
  for each statement execute function public.reject_append_only_mutation();
create trigger coin_purchases_append_only before update or delete on coin_purchases
  for each row execute function public.reject_append_only_mutation();
create trigger coin_purchases_no_truncate before truncate on coin_purchases
  for each statement execute function public.reject_append_only_mutation();
create trigger gift_events_append_only before update or delete on gift_events
  for each row execute function public.reject_append_only_mutation();
create trigger gift_events_no_truncate before truncate on gift_events
  for each statement execute function public.reject_append_only_mutation();

-- creator_terms: the ONLY permitted mutation is superseded_at null → value,
-- with every other column unchanged.
create function public.creator_terms_guard_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.superseded_at is null
       and new.superseded_at is not null
       and (old.id, old.user_id, old.version, old.creator_share_bps, old.min_payout_cents,
            old.payout_delay_days, old.effective_from, old.summary, old.created_at)
           is not distinct from
           (new.id, new.user_id, new.version, new.creator_share_bps, new.min_payout_cents,
            new.payout_delay_days, new.effective_from, new.summary, new.created_at)
    then
      return new;
    end if;
    raise exception 'creator_terms is immutable: only superseded_at may be set, once'
      using errcode = 'P0001';
  end if;
  -- DELETE or TRUNCATE
  raise exception 'creator_terms is append-only: % is not permitted', tg_op
    using errcode = 'P0001';
end $$;
create trigger creator_terms_guard before update or delete on creator_terms
  for each row execute function public.creator_terms_guard_mutation();
create trigger creator_terms_no_truncate before truncate on creator_terms
  for each statement execute function public.creator_terms_guard_mutation();

-- Double-entry invariant, checked at COMMIT (deferred) so multi-row postings
-- can be inserted one entry at a time. For the entry's transaction:
--   * each entry's currency equals its account's currency;
--   * per currency, sum(debit) = sum(credit).
create function public.assert_ledger_txn_balanced() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  bad_currency text;
begin
  if exists (
    select 1
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
    where e.transaction_id = new.transaction_id and e.currency <> a.currency
  ) then
    raise exception 'ledger_currency_mismatch: transaction %', new.transaction_id
      using errcode = 'P0001';
  end if;

  select currency into bad_currency
  from public.ledger_entries
  where transaction_id = new.transaction_id
  group by currency
  having sum(case when side = 'debit'  then amount else 0 end)
      <> sum(case when side = 'credit' then amount else 0 end)
  limit 1;
  if found then
    raise exception 'ledger_unbalanced: transaction % currency %', new.transaction_id, bad_currency
      using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function public.assert_ledger_txn_balanced();

-- ============================================================================
-- MONEY POSTING API — the only write path for money.
-- ============================================================================

-- Coin → gross cents. 1 coin = 1 cent gross. Changing this is a pricing
-- decision; it lives in exactly one place.
create function public.coin_value_cents() returns integer
language sql immutable as $$ select 1 $$;
comment on function public.coin_value_cents() is
  'Gross value of one coin in USD cents (1 coin = 1 cent). Single source of truth.';

create function public.ensure_ledger_account(owner uuid, kind text, currency text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
-- Parameter names mirror the column names (the documented API); inside SQL,
-- bare names mean columns and parameters are qualified with the function name.
declare
  account_id uuid;
begin
  insert into public.ledger_accounts (owner_id, kind, currency)
  values (ensure_ledger_account.owner, ensure_ledger_account.kind, ensure_ledger_account.currency)
  on conflict (owner_id, kind, currency) do nothing;

  select a.id into account_id
  from public.ledger_accounts a
  where a.owner_id is not distinct from ensure_ledger_account.owner
    and a.kind = ensure_ledger_account.kind
    and a.currency = ensure_ledger_account.currency;
  if account_id is null then
    raise exception 'ledger_account_unresolved: % % %',
      ensure_ledger_account.owner, ensure_ledger_account.kind, ensure_ledger_account.currency;
  end if;
  return account_id;
end $$;

-- DEV / processor-webhook use: record a purchase and issue coins.
--   debit coin_issuance (system), credit the buyer's user_coins.
create function public.purchase_coins(product_id uuid, processor text, processor_txn_id text)
returns public.coin_purchases
language plpgsql security definer set search_path = public, extensions as $$
declare
  buyer uuid := auth.uid();
  product public.coin_products%rowtype;
  purchase public.coin_purchases%rowtype;
  txn_id uuid;
begin
  if buyer is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into product from public.coin_products p
  where p.id = purchase_coins.product_id and p.active;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;
  if processor is null or length(btrim(processor)) = 0 then
    raise exception 'processor_required' using errcode = 'P0001';
  end if;

  insert into public.coin_purchases
    (user_id, product_id, coins, gross_cents, platform_fee_cents, processor, processor_txn_id)
  values
    (buyer, product.id, product.coins, product.price_cents, 0,
     purchase_coins.processor, purchase_coins.processor_txn_id)
  returning * into purchase;

  insert into public.ledger_transactions (kind, reference_id, memo)
  values ('coin_purchase', purchase.id, product.sku)
  returning id into txn_id;

  insert into public.ledger_entries (transaction_id, account_id, side, amount, currency) values
    (txn_id, public.ensure_ledger_account(null,  'coin_issuance', 'COIN'), 'debit',  purchase.coins, 'COIN'),
    (txn_id, public.ensure_ledger_account(buyer, 'user_coins',    'COIN'), 'credit', purchase.coins, 'COIN');

  return purchase;
end $$;

-- Send a gift. Split (integer math, gross = app_store + platform + creator_net):
--   gross         = coins_total * coin_value_cents()
--   app_store     = floor(gross * 30 / 100)
--   creator_net   = floor((gross - app_store) * share_bps / 10000)
--   platform      = gross - app_store - creator_net
-- Ledger (COIN): debit sender user_coins, credit recipient creator_earnings.
create function public.send_gift(recipient uuid, gift uuid, qty integer,
                                 post uuid default null, stream uuid default null)
returns public.gift_events
language plpgsql security definer set search_path = public, extensions as $$
declare
  sender uuid := auth.uid();
  gift_row public.gift_catalog%rowtype;
  terms public.creator_terms%rowtype;
  context_owner uuid;
  context_ok boolean;
  sender_account uuid;
  txn_id uuid;
  event_id uuid := gen_random_uuid();
  coins_total bigint;
  gross bigint;
  app_store bigint;
  creator_net bigint;
  platform bigint;
  balance bigint;
  event public.gift_events%rowtype;
begin
  if sender is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if num_nonnulls(post, stream) <> 1 then
    raise exception 'exactly_one_context_required' using errcode = 'P0001';
  end if;
  if qty is null or qty <= 0 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;
  if recipient is null or recipient = sender then
    raise exception 'invalid_recipient' using errcode = 'P0001';
  end if;
  if not public.is_adult(sender) then
    raise exception 'sender_not_adult' using errcode = 'P0001';
  end if;
  -- Policy gating: receiving gifts requires 18+ verified.
  if not public.is_age_verified_adult(recipient) then
    raise exception 'recipient_not_eligible' using errcode = 'P0001';
  end if;

  select * into gift_row from public.gift_catalog g where g.id = send_gift.gift and g.active;
  if not found then
    raise exception 'gift_not_found' using errcode = 'P0001';
  end if;

  -- The context must belong to the recipient and accept gifts.
  if post is not null then
    select p.author_id, (p.deleted_at is null and p.allow_gifts) into context_owner, context_ok
    from public.posts p where p.id = send_gift.post;
  else
    select s.host_id, true into context_owner, context_ok
    from public.live_streams s where s.id = send_gift.stream;
  end if;
  if context_owner is null or context_owner <> recipient or not context_ok then
    raise exception 'invalid_context' using errcode = 'P0001';
  end if;

  -- Active terms: user-specific if present, else the platform default.
  select * into terms from public.creator_terms t
  where t.user_id = recipient and t.superseded_at is null and t.effective_from <= now();
  if not found then
    select * into terms from public.creator_terms t
    where t.user_id is null and t.superseded_at is null;
  end if;
  if not found then
    raise exception 'no_active_terms' using errcode = 'P0001';
  end if;

  coins_total := gift_row.coins::bigint * qty::bigint;
  gross       := coins_total * public.coin_value_cents();
  if gross > 2147483647 then
    raise exception 'gift_too_large' using errcode = 'P0001';
  end if;
  app_store   := (gross * 30) / 100;
  creator_net := ((gross - app_store) * terms.creator_share_bps) / 10000;
  platform    := gross - app_store - creator_net;

  -- Serialize concurrent spends from the same wallet, then check balance.
  sender_account := public.ensure_ledger_account(sender, 'user_coins', 'COIN');
  perform 1 from public.ledger_accounts where id = sender_account for update;
  select coalesce(sum(case when side = 'credit' then amount else -amount end), 0)
    into balance
  from public.ledger_entries where account_id = sender_account;
  if balance < coins_total then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.ledger_transactions (kind, reference_id, memo)
  values ('gift', event_id, gift_row.name)
  returning id into txn_id;

  insert into public.ledger_entries (transaction_id, account_id, side, amount, currency) values
    (txn_id, sender_account, 'debit', coins_total, 'COIN'),
    (txn_id, public.ensure_ledger_account(recipient, 'creator_earnings', 'COIN'), 'credit', coins_total, 'COIN');

  insert into public.gift_events
    (id, sender_id, recipient_id, gift_id, quantity, coins_total, stream_id, post_id, terms_id,
     gross_cents, app_store_fee_cents, platform_fee_cents, creator_net_cents, ledger_transaction_id)
  values
    (event_id, sender, recipient, gift_row.id, qty, coins_total, stream, post, terms.id,
     gross, app_store, platform, creator_net, txn_id)
  returning * into event;

  return event;
end $$;

-- Function privileges. Supabase grants EXECUTE to anon/authenticated by
-- default; tighten it for anything that writes money or is trigger-only.
revoke execute on function public.ensure_ledger_account(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.purchase_coins(uuid, text, text)        from public, anon;
revoke execute on function public.send_gift(uuid, uuid, integer, uuid, uuid) from public, anon;
grant  execute on function public.purchase_coins(uuid, text, text)        to authenticated;
grant  execute on function public.send_gift(uuid, uuid, integer, uuid, uuid) to authenticated;
revoke execute on function public.handle_new_auth_user()        from public, anon, authenticated;
revoke execute on function public.assert_ledger_txn_balanced()  from public, anon, authenticated;
revoke execute on function public.maintain_follow_counts()      from public, anon, authenticated;
revoke execute on function public.maintain_post_count()         from public, anon, authenticated;
revoke execute on function public.maintain_like_count()         from public, anon, authenticated;
revoke execute on function public.maintain_comment_count()      from public, anon, authenticated;
revoke execute on function public.require_verified_adult_host() from public, anon, authenticated;
revoke execute on function public.require_dm_permission()       from public, anon, authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY — every table in public.
-- ============================================================================
alter table users                  enable row level security;
alter table profiles               enable row level security;
alter table follows                enable row level security;
alter table friendships            enable row level security;
alter table blocks                 enable row level security;
alter table media_assets           enable row level security;
alter table posts                  enable row level security;
alter table post_media             enable row level security;
alter table likes                  enable row level security;
alter table comments               enable row level security;
alter table reach_events           enable row level security;
alter table post_daily_stats       enable row level security;
alter table conversations          enable row level security;
alter table conversation_members   enable row level security;
alter table messages               enable row level security;
alter table live_streams           enable row level security;
alter table live_participants      enable row level security;
alter table live_chat_messages     enable row level security;
alter table stream_trusted_members enable row level security;
alter table coin_products          enable row level security;
alter table coin_purchases         enable row level security;
alter table ledger_accounts        enable row level security;
alter table ledger_transactions    enable row level security;
alter table ledger_entries         enable row level security;
alter table creator_terms          enable row level security;
alter table gift_catalog           enable row level security;
alter table gift_events            enable row level security;
alter table payout_accounts        enable row level security;
alter table payouts                enable row level security;
alter table reports                enable row level security;
alter table moderation_decisions   enable row level security;
alter table appeals                enable row level security;
alter table devices                enable row level security;
alter table notifications          enable row level security;

-- Column privileges: clients may not write counters, verification flags,
-- roles, or moderation tiers. Those move only via triggers / service role.
revoke insert, update on users from anon, authenticated;
grant  update (phone, country_code) on users to authenticated;

revoke insert, update on profiles from anon, authenticated;
grant  update (username, display_name, bio, avatar_media_id, link_url) on profiles to authenticated;

revoke insert, update on posts from anon, authenticated;
grant  insert (id, author_id, kind, caption, visibility, expires_at, allow_comments, allow_gifts)
  on posts to authenticated;
grant  update (caption, visibility, expires_at, allow_comments, allow_gifts, deleted_at)
  on posts to authenticated;

revoke insert, update on comments from anon, authenticated;
grant  insert (id, post_id, author_id, parent_id, body) on comments to authenticated;
grant  update (body, deleted_at) on comments to authenticated;

revoke insert, update on messages from anon, authenticated;
grant  insert (id, conversation_id, sender_id, body, media_id, shared_post_id, reply_to_id)
  on messages to authenticated;
grant  update (body, edited_at, deleted_at) on messages to authenticated;

revoke insert, update on live_chat_messages from anon, authenticated;
grant  insert (stream_id, user_id, body) on live_chat_messages to authenticated;
grant  update (deleted_at) on live_chat_messages to authenticated;

-- reach_events / post_daily_stats: no client writes at all.
revoke insert, update, delete, truncate on reach_events, post_daily_stats from anon, authenticated;

-- Money: no client writes at all. Posting functions are the only path.
revoke insert, update, delete, truncate on
  coin_products, coin_purchases, ledger_accounts, ledger_transactions, ledger_entries,
  creator_terms, gift_catalog, gift_events, payout_accounts, payouts
  from anon, authenticated;

-- users: own row only (DOB of others is private).
create policy users_select_own on users for select to authenticated
  using (id = (select auth.uid()));
create policy users_update_own on users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- profiles: everyone, except across a block.
create policy profiles_select on profiles for select to anon, authenticated
  using (not public.is_blocked_between((select auth.uid()), user_id));
create policy profiles_update_own on profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Safe public projection (no DOB, no email); inherits profiles RLS.
create view public_profiles with (security_invoker = true) as
select user_id, username, display_name, bio, avatar_media_id, link_url,
       is_creator, is_verified, follower_count, following_count, post_count, updated_at
from profiles;

-- follows: readable unless either party is blocked with the viewer.
create policy follows_select on follows for select to anon, authenticated
  using (not public.is_blocked_between((select auth.uid()), follower_id)
         and not public.is_blocked_between((select auth.uid()), followee_id));
create policy follows_insert_own on follows for insert to authenticated
  with check (follower_id = (select auth.uid())
              and not public.is_blocked_between(follower_id, followee_id));
create policy follows_delete_own on follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- friendships: the two parties.
create policy friendships_select on friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on friendships for insert to authenticated
  with check (requester_id = (select auth.uid())
              and status = 'pending'
              and not public.is_blocked_between(requester_id, addressee_id));
create policy friendships_update on friendships for update to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id))
  with check ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_delete on friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- blocks: own rows only (the blocked party never learns of the block).
create policy blocks_own on blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- media_assets: owner, or anyone for ready, non-deleted media.
create policy media_select on media_assets for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (status = 'ready' and deleted_at is null));
create policy media_insert_own on media_assets for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy media_update_own on media_assets for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- posts: visibility via can_view_post; authors insert/update/soft-delete own.
create policy posts_select on posts for select to anon, authenticated
  using (public.can_view_post(id, (select auth.uid())));
create policy posts_insert_own on posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy posts_update_own on posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy post_media_select on post_media for select to anon, authenticated
  using (public.can_view_post(post_id, (select auth.uid())));
create policy post_media_insert_own on post_media for insert to authenticated
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy post_media_delete_own on post_media for delete to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- likes/comments: read follows the post's visibility.
create policy likes_select on likes for select to anon, authenticated
  using (public.can_view_post(post_id, (select auth.uid())));
create policy likes_insert_own on likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_post(post_id, (select auth.uid())));
create policy likes_delete_own on likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on comments for select to anon, authenticated
  using (public.can_view_post(post_id, (select auth.uid())));
create policy comments_insert_own on comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and public.can_view_post(post_id, (select auth.uid()))
              and exists (select 1 from posts p where p.id = post_id and p.allow_comments));
create policy comments_update_own on comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy comments_delete_own on comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- reach_events / post_daily_stats: the post's author and moderators only.
create policy reach_events_select on reach_events for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid()))
         or public.is_moderator());
create policy post_daily_stats_select on post_daily_stats for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid()))
         or public.is_moderator());

-- conversations / members / messages: members only.
create policy conversations_select on conversations for select to authenticated
  using (public.is_member(id, (select auth.uid())) or created_by = (select auth.uid()));
create policy conversations_insert on conversations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy conversations_update on conversations for update to authenticated
  using (public.is_member(id, (select auth.uid())))
  with check (public.is_member(id, (select auth.uid())));

create policy conversation_members_select on conversation_members for select to authenticated
  using (public.is_member(conversation_id, (select auth.uid())));
-- The conversation creator adds members (including themself).
create policy conversation_members_insert on conversation_members for insert to authenticated
  with check (exists (select 1 from conversations c
                      where c.id = conversation_id and c.created_by = (select auth.uid())));
create policy conversation_members_update_own on conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy messages_select on messages for select to authenticated
  using (public.is_member(conversation_id, (select auth.uid())));
create policy messages_insert_own on messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_member(conversation_id, (select auth.uid())));
create policy messages_update_own on messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

-- live: readable if the stream exists; host manages own stream.
create policy live_streams_select on live_streams for select to anon, authenticated
  using (true);
create policy live_streams_insert_own on live_streams for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy live_streams_update_own on live_streams for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy live_streams_delete_own on live_streams for delete to authenticated
  using (host_id = (select auth.uid()));

create policy live_participants_select on live_participants for select to anon, authenticated
  using (true);
create policy live_participants_insert_own on live_participants for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy live_participants_update_own on live_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy live_chat_select on live_chat_messages for select to anon, authenticated
  using (true);
create policy live_chat_insert_own on live_chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy live_chat_update_own on live_chat_messages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy trusted_select on stream_trusted_members for select to authenticated
  using (host_id = (select auth.uid()) or user_id = (select auth.uid()));
create policy trusted_insert_host on stream_trusted_members for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy trusted_delete_host on stream_trusted_members for delete to authenticated
  using (host_id = (select auth.uid()));

-- Money: SELECT only, by owner. No write policies exist (and no privileges).
create policy coin_products_select on coin_products for select to anon, authenticated
  using (true);
create policy gift_catalog_select on gift_catalog for select to anon, authenticated
  using (true);
create policy coin_purchases_select_own on coin_purchases for select to authenticated
  using (user_id = (select auth.uid()));
create policy ledger_accounts_select_own on ledger_accounts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy ledger_entries_select_own on ledger_entries for select to authenticated
  using (exists (select 1 from ledger_accounts a
                 where a.id = account_id and a.owner_id = (select auth.uid())));
create policy ledger_transactions_select_own on ledger_transactions for select to authenticated
  using (exists (select 1 from ledger_entries e
                 join ledger_accounts a on a.id = e.account_id
                 where e.transaction_id = ledger_transactions.id
                   and a.owner_id = (select auth.uid())));
create policy creator_terms_select on creator_terms for select to anon, authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy gift_events_select_party on gift_events for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy payout_accounts_select_own on payout_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy payouts_select_own on payouts for select to authenticated
  using (user_id = (select auth.uid()));

-- reports: file as yourself, see your own; moderators see and work the queue.
create policy reports_insert_own on reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy reports_select on reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_moderator());
create policy reports_update_moderator on reports for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- moderation_decisions: subject reads own; moderators do everything.
create policy moderation_decisions_select on moderation_decisions for select to authenticated
  using (subject_user_id = (select auth.uid()) or public.is_moderator());
create policy moderation_decisions_moderator on moderation_decisions for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- appeals: subject files and reads own; moderators read and record outcomes.
create policy appeals_insert_own on appeals for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from moderation_decisions d
                          where d.id = decision_id and d.subject_user_id = (select auth.uid())));
create policy appeals_select on appeals for select to authenticated
  using (user_id = (select auth.uid()) or public.is_moderator());
create policy appeals_update_moderator on appeals for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- notifications / devices: own rows only.
create policy devices_own on devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own on notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================================
-- STORAGE — bucket `media`: public read; authenticated upload under
-- `<auth.uid()>/...` only.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy media_public_read on storage.objects for select to public
  using (bucket_id = 'media');
create policy media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
