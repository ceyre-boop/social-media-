-- ============================================================================
-- 021 — content_filter (brief M3 §5, Community Policy v0.1 tiers).
--
--   live_streams.chat_strictness   per-stream creator threshold: open / standard /
--                                  protected (default standard). Only ever
--                                  touches YELLOW; ORANGE and RED are enforced at
--                                  every level (enforced in the pipeline, not
--                                  here: this column cannot express "looser").
--   trusted_circle_members         a creator's pre-approved regulars; they bypass
--                                  YELLOW in that creator's live chat, nothing
--                                  else. Creator-owned, RLS: only the creator
--                                  sees or edits their circle.
--   ops.content_filter_events      one row per non-GREEN verdict. GREEN is never
--                                  logged (policy: "no friction, no logging").
--                                  The message body is stored ONLY for RED, for
--                                  human review. YELLOW overrides are a
--                                  behavioural signal retained 30 days, never a
--                                  reach input.
--   ops.content_filter_review_queue  every RED event, due_by = created_at + 24h
--                                  ("Human review within 24h, no exceptions").
--
-- Writes come only from the `content-filter` Edge Function over its direct
-- database connection. The ops schema is not exposed through the API and has
-- no grants to anon / authenticated.
--
-- Note: the brief expected chat_strictness and a trusted-members table to exist
-- from 003. They did not; they are created here.
-- ============================================================================

-- ------------------------------------------------------------------ strictness
create type public.chat_strictness as enum ('open', 'standard', 'protected');

alter table public.live_streams
  add column chat_strictness public.chat_strictness not null default 'standard';

-- The host already updates their own stream (policy live_streams_update_own).
grant update (chat_strictness) on public.live_streams to authenticated;
-- live_streams SELECT is column-granted (ingest_url stays hidden); the room's
-- strictness is public so chat clients can explain it.
grant select (chat_strictness) on public.live_streams to anon, authenticated;

-- ------------------------------------------------------------------ Trusted Circles
create table public.trusted_circle_members (
  creator_id  uuid not null references public.users(id) on delete cascade,
  member_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (creator_id, member_id),
  constraint trusted_circle_not_self check (creator_id <> member_id)
);
create index trusted_circle_member_idx on public.trusted_circle_members (member_id);

alter table public.trusted_circle_members enable row level security;
revoke all on public.trusted_circle_members from public, anon, authenticated;
grant select, insert, delete on public.trusted_circle_members to authenticated;

create policy trusted_circle_select_own on public.trusted_circle_members
  for select to authenticated using (creator_id = (select auth.uid()));
create policy trusted_circle_insert_own on public.trusted_circle_members
  for insert to authenticated with check (creator_id = (select auth.uid()));
create policy trusted_circle_delete_own on public.trusted_circle_members
  for delete to authenticated using (creator_id = (select auth.uid()));

-- ------------------------------------------------------------------ events
create type ops.content_filter_tier as enum ('GREEN', 'YELLOW', 'ORANGE', 'RED');

create table ops.content_filter_events (
  id                    uuid primary key default gen_random_uuid(),
  surface               text not null check (surface in ('live_chat', 'dm', 'comment')),
  -- set null, not cascade: a RED event must survive the sender deleting their
  -- account until a human has reviewed it.
  sender_id             uuid references public.users(id) on delete set null,
  stream_id             uuid references public.live_streams(id) on delete set null,
  tier                  ops.content_filter_tier not null,
  raw_tier              ops.content_filter_tier not null,
  reason_codes          text[] not null default '{}',
  policy_refs           text[] not null default '{}',
  latency_ms            integer not null check (latency_ms >= 0),
  body                  text,
  yellow_overridden_at  timestamptz,
  created_at            timestamptz not null default now(),
  constraint content_filter_events_not_green check (tier <> 'GREEN'),
  constraint content_filter_events_body_red_only check ((tier = 'RED') = (body is not null)),
  constraint content_filter_events_override_yellow_only
    check (yellow_overridden_at is null or tier = 'YELLOW')
);
create index content_filter_events_sender_idx on ops.content_filter_events (sender_id, created_at desc);
create index content_filter_events_tier_idx   on ops.content_filter_events (tier, created_at);

-- ------------------------------------------------------------------ RED review queue
create table ops.content_filter_review_queue (
  id           bigint generated always as identity primary key,
  event_id     uuid not null unique references ops.content_filter_events(id) on delete restrict,
  due_by       timestamptz not null,
  status       text not null default 'open' check (status in ('open', 'in_review', 'resolved')),
  reviewer_id  uuid references public.users(id) on delete set null,
  outcome      text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint content_filter_review_resolved check ((status = 'resolved') = (resolved_at is not null))
);
create index content_filter_review_due_idx on ops.content_filter_review_queue (due_by)
  where status <> 'resolved';

create function ops.content_filter_queue_red() returns trigger
language plpgsql security definer set search_path = ops, public as $$
begin
  insert into ops.content_filter_review_queue (event_id, due_by)
  values (new.id, new.created_at + interval '24 hours');
  return new;
end $$;

create trigger content_filter_events_queue_red
  after insert on ops.content_filter_events
  for each row when (new.tier = 'RED')
  execute function ops.content_filter_queue_red();

-- ------------------------------------------------------------------ retention
-- YELLOW (incl. override signals) and ORANGE rows are kept 30 days. ORANGE is
-- resolved the moment the sender rephrases; the row exists only for escalation
-- review. RED rows are kept (review and appeals need them).
create function ops.content_filter_purge() returns integer
language sql security definer set search_path = ops, public as $$
  with gone as (
    delete from ops.content_filter_events
    where tier in ('YELLOW', 'ORANGE') and created_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

select cron.schedule('content-filter-purge', '17 3 * * *', $$select ops.content_filter_purge()$$);

-- ------------------------------------------------------------------ access
revoke all on ops.content_filter_events, ops.content_filter_review_queue from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;
revoke execute on function ops.content_filter_queue_red() from public, anon, authenticated;
revoke execute on function ops.content_filter_purge() from public, anon, authenticated;
