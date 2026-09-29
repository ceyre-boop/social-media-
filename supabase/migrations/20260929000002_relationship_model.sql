-- ============================================================================
-- 002 — RELATIONSHIP MODEL (brief §4) + age-verification columns (brief §7)
--
-- There is no follow button. Relationship state is derived from behavior
-- (interactions), never inserted by a user action. `follows` and the public
-- follower/following counters are removed (brief §6.7: no public counts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Brief §4, "Required schema changes" 1 — verbatim.
-- ----------------------------------------------------------------------------

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

-- The brief lists the allowed values only as comments; make them constraints so
-- a typo in the app or the recompute job fails loudly instead of creating an
-- unknown state/kind that no policy recognizes.
alter table interactions
  add constraint interactions_kind_check
  check (kind in ('view','complete','like','comment','share','profile_visit','stream_join'));
alter table relationships
  add constraint relationships_state_check
  check (state in ('seen','returning','regular'));

-- ----------------------------------------------------------------------------
-- Brief §4, "Required schema changes" 1 and 2.
-- ----------------------------------------------------------------------------
drop table follows;

alter table profiles
  drop column follower_count,
  drop column following_count;

-- ----------------------------------------------------------------------------
-- Brief §7: age verification persists a boolean plus the provider's reference
-- token. Identity documents are never stored.
-- ----------------------------------------------------------------------------
alter table users
  add column age_verified         boolean not null default false,
  add column age_verified_at      timestamptz,
  add column age_verification_ref text;

-- ----------------------------------------------------------------------------
-- Relationship helpers. security definer so RLS policies can consult
-- `relationships` regardless of the caller's own read access to it. EXECUTE is
-- revoked from clients in migration 003 so nobody can probe other users'
-- relationships; policies reach them through security-definer wrappers.
-- ----------------------------------------------------------------------------

-- Derived state of actor → subject, or null when there is none.
create function public.relationship_state(actor uuid, subject uuid) returns text
language sql stable security definer set search_path = public as $$
  select r.state from public.relationships r
  where r.actor_id = actor and r.subject_id = subject;
$$;

-- Brief §4: `mutual` = both directions are `regular`.
create function public.is_mutual(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b
     and coalesce(public.relationship_state(a, b) = 'regular', false)
     and coalesce(public.relationship_state(b, a) = 'regular', false);
$$;
