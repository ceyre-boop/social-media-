-- ============================================================================
-- 022 — Settings (brief M3 §6).
--
--   users.friend_requests_from   who may send this person a friend request:
--                                'everyone' (default) | 'following' (people they
--                                follow) | 'nobody'. Enforced inside
--                                private.may_befriend, so request_friend keeps
--                                its one generic refusal and never says why.
--                                An existing pending/accepted pair is not
--                                affected (asking back, accepting).
--   users.default_chat_strictness  the strictness new live streams start with
--                                (migration 021 only ever stores it per stream).
--                                Never below ORANGE: strictness only touches
--                                YELLOW; ORANGE and RED are not configurable.
--   data_export_requests         a request only; no export job yet. One open
--                                request per person.
--   account_deletion_requests    a 7-day grace period, cancellable. Nothing is
--                                hard-deleted here: creator balances and
--                                retained-minor-thread messages need the unwind
--                                path in docs/launch-readiness.md (item 6).
-- ============================================================================

-- ---------------------------------------------------------- friend request permission
create type public.friend_request_policy as enum ('everyone', 'following', 'nobody');

alter table public.users
  add column friend_requests_from public.friend_request_policy not null default 'everyone',
  add column default_chat_strictness public.chat_strictness not null default 'standard';
grant update (friend_requests_from, default_chat_strictness) on public.users to authenticated;

-- Does t take requests from s? 'following' = t follows s.
create function private.accepts_friend_requests_from(t uuid, s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case u.friend_requests_from
           when 'everyone' then true
           when 'following' then exists (
             select 1 from public.follows f where f.follower_id = t and f.followee_id = s)
           else false
         end
    from public.users u where u.id = t;
$$;
revoke execute on function private.accepts_friend_requests_from(uuid, uuid) from public, anon, authenticated;

create or replace function private.may_befriend(s uuid, t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and t is not null and s <> t
     and exists (select 1 from public.profiles p where p.user_id = t)
     and not private.blocked_between(s, t)
     and private.may_request(s, t)
     and (
       -- a pair already in motion (pending or friends) is not a new request
       exists (select 1 from public.friendships f
                where f.user_a_id = least(s, t) and f.user_b_id = greatest(s, t)
                  and f.state in ('pending', 'accepted'))
       or private.accepts_friend_requests_from(t, s)
     );
$$;

-- New streams start at the host's default (only when the stream wasn't given a
-- non-default value explicitly).
create function private.apply_default_chat_strictness() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.chat_strictness = 'standard' then
    select u.default_chat_strictness into new.chat_strictness
      from public.users u where u.id = new.host_id;
  end if;
  return new;
end $$;
revoke execute on function private.apply_default_chat_strictness() from public, anon, authenticated;
create trigger live_streams_default_strictness
  before insert on public.live_streams
  for each row execute function private.apply_default_chat_strictness();

-- ---------------------------------------------------------- data export requests
create table public.data_export_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  status        text not null default 'requested'
                  check (status in ('requested', 'processing', 'ready', 'failed')),
  ready_at      timestamptz
);
-- one open request at a time
create unique index data_export_requests_open_key on public.data_export_requests (user_id)
  where status in ('requested', 'processing');

alter table public.data_export_requests enable row level security;
revoke all on public.data_export_requests from public, anon, authenticated;
grant select on public.data_export_requests to authenticated;
grant insert (user_id) on public.data_export_requests to authenticated;
create policy data_export_requests_select_own on public.data_export_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy data_export_requests_insert_own on public.data_export_requests
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------- account deletion requests
create table public.account_deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  scheduled_for timestamptz not null default now() + interval '7 days',
  cancelled_at  timestamptz,
  status        text not null default 'pending'
                  check (status in ('pending', 'cancelled', 'completed')),
  constraint account_deletion_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index account_deletion_requests_pending_key on public.account_deletion_requests (user_id)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy account_deletion_requests_select_own on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));

-- Start a deletion: the caller must type their own username. Idempotent: an
-- existing pending request is returned, not duplicated. Returns scheduled_for.
create function public.request_account_deletion(confirm_username text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  due timestamptz;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.user_id = me and lower(p.username::text) = lower(btrim(coalesce(confirm_username, '')))) then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  select scheduled_for into due from public.account_deletion_requests
   where user_id = me and status = 'pending';
  if found then
    return due;
  end if;
  insert into public.account_deletion_requests (user_id) values (me)
  returning scheduled_for into due;
  return due;
end $$;
revoke execute on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

-- Cancel a pending deletion. True if there was one.
create function public.cancel_account_deletion() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  update public.account_deletion_requests
     set status = 'cancelled', cancelled_at = now()
   where user_id = me and status = 'pending';
  return found;
end $$;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------- blocked users list
-- Blocked people's profiles are hidden from the blocker (profiles RLS), so the
-- Settings list reads names through this. Own rows only.
create function public.my_blocked_users()
returns table (user_id uuid, username text, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, p.username::text, p.display_name, b.created_at
    from public.blocks b
    left join public.profiles p on p.user_id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;
revoke execute on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;
