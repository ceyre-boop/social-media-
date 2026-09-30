-- ============================================================================
-- 014 — Friendships (brief M3 §1 "Visibility — friends only, always").
--
-- Explicit, mutual friendship. Used ONLY by Moments. Posts marked "friends"
-- keep their behaviour-derived meaning (is_mutual; Colin, Plans/milestone-3.md
-- flag 1), so the two never mix.
--
-- Replaces the unused v0.1 table (requester/addressee/status). Nothing in the
-- app read or wrote it; its policies and grants go with it, and so does the
-- friend_status enum (used nowhere else).
--
-- ----------------------------------------------------------------------------
-- Shape: one row per pair, canonical order user_a_id < user_b_id.
--   state  pending | accepted | declined      requested_by  who asked
--
-- Write paths are security-definer RPCs only; clients have no privileges on
-- the table and read their own view of it through public.my_friendships().
--
--   request_friend(target)       ask; see the table below
--   respond_friend(other, bool)  the asked person accepts or declines
--   remove_friend(other)         unfriend, or withdraw your own request
--
-- ----------------------------------------------------------------------------
-- Who may ask whom (enforced here, never in the app):
--   minor → anyone                  allowed
--   adult → adult                   allowed
--   adult → connected minor         allowed ("connected" = public.is_mutual,
--                                   the same notion as DMs; reuses migration
--                                   010's private.may_request)
--   adult → unconnected minor       refused
--   across a block, either way      refused; blocking also ends the friendship
--   yourself / nobody               refused
-- Every refusal raises the same 'request_not_allowed' (P0001), so a refusal
-- never reveals whether the other person is a minor, has blocked you, or
-- exists. Accepting re-checks the block and the age rule.
--
-- ----------------------------------------------------------------------------
-- Declines are never observable (same stance as DM requests in 010, §B):
--   * The requester sees a declined request exactly like a pending one
--     ("outgoing") in my_friendships(). The decliner no longer sees it.
--   * No notification on decline.
-- No harassment loop — a declined request cannot be re-sent by the same
-- requester for 30 days:
--   * request_friend on your own declined request within 30 days of the
--     decline is a silent no-op (it looks like the request is still pending,
--     which is what it has always looked like). After 30 days it becomes a new
--     pending request and notifies again.
--   * Withdrawing a declined request (remove_friend) only hides it from you;
--     the row and its cooldown stay. Withdrawing a pending request deletes it.
--   * The other person may always ask you (a declined row they did not start
--     turns into their pending request).
--   * friend_request notifications are keyed per requester per UTC day, so
--     ask → withdraw → ask sends at most one push a day.
-- If both people ask each other, the second ask accepts.
--
-- Nobody else can see who is friends with whom. No counts are exposed anywhere.
-- ============================================================================

drop table if exists public.friendships cascade;
drop type if exists public.friend_status;

create table public.friendships (
  user_a_id          uuid not null references public.users(id) on delete cascade,
  user_b_id          uuid not null references public.users(id) on delete cascade,
  state              text not null default 'pending'
                     check (state in ('pending', 'accepted', 'declined')),
  requested_by       uuid not null references public.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  declined_at        timestamptz,
  -- The requester withdrew a request that had (unknown to them) been declined:
  -- hidden from them, kept for the cooldown.
  requester_withdrew boolean not null default false,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (requested_by in (user_a_id, user_b_id)),
  check ((state = 'accepted') = (accepted_at is not null)),
  check ((state = 'declined') = (declined_at is not null))
);
create index friendships_b_idx on public.friendships (user_b_id);

alter table public.friendships enable row level security;
-- Each party can see their own rows; nobody else sees anything. (Clients hold
-- no table privileges at all; this policy is the backstop if one is granted.)
create policy friendships_party on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a_id, user_b_id));
revoke all on public.friendships from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
create function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.friendships f
     where f.user_a_id = least(a, b) and f.user_b_id = greatest(a, b)
       and f.state = 'accepted');
$$;

-- May `s` ask `t` to be friends? Block + age (migration 010's may_request).
create function private.may_befriend(s uuid, t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and t is not null and s <> t
     and exists (select 1 from public.profiles p where p.user_id = t)
     and not private.blocked_between(s, t)
     and private.may_request(s, t);
$$;

create function private.friend_display_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.display_name), ''), p.username::text)
    from public.profiles p where p.user_id = u;
$$;

create function private.notify_friend_request(requester uuid, target uuid) returns void
language sql security definer set search_path = public as $$
  select ops.notify(target, 'friend_request',
                    'friend_request:' || requester::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
                    jsonb_build_object('actor_name', private.friend_display_name(requester)),
                    requester);
$$;

-- ---------------------------------------------------------------- RPCs
create function public.request_friend(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f  public.friendships%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not private.may_befriend(me, target) then
    raise exception 'request_not_allowed' using errcode = 'P0001';
  end if;

  select * into f from public.friendships
   where user_a_id = least(me, target) and user_b_id = greatest(me, target)
   for update;

  if not found then
    insert into public.friendships (user_a_id, user_b_id, requested_by)
    values (least(me, target), greatest(me, target), me);
    perform private.notify_friend_request(me, target);
    return 'requested';
  end if;

  if f.state = 'accepted' then
    return 'friends';
  end if;

  if f.state = 'pending' and f.requested_by = target then
    -- They asked first: asking back accepts.
    update public.friendships set state = 'accepted', accepted_at = now()
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
    perform ops.notify(target, 'friend_accepted', 'friend_accepted:' || me::text,
                       jsonb_build_object('actor_name', private.friend_display_name(me)), me);
    return 'friends';
  end if;

  if f.state = 'pending' then  -- my own pending request
    return 'requested';
  end if;

  -- declined
  if f.requested_by = me then
    if f.declined_at > now() - interval '30 days' then
      -- Cooldown: silently looks pending, exactly as it always has to me.
      update public.friendships set requester_withdrew = false
       where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
      return 'requested';
    end if;
  end if;
  update public.friendships
     set state = 'pending', requested_by = me, created_at = now(),
         declined_at = null, requester_withdrew = false
   where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  perform private.notify_friend_request(me, target);
  return 'requested';
end $$;

create function public.respond_friend(other uuid, accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f  public.friendships%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into f from public.friendships
   where user_a_id = least(me, other) and user_b_id = greatest(me, other)
     and state = 'pending' and requested_by = other and other <> me
   for update;
  if not found then
    raise exception 'request_not_allowed' using errcode = 'P0001';
  end if;

  if not accept then
    update public.friendships set state = 'declined', declined_at = now()
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
    return 'declined';
  end if;

  if not private.may_befriend(other, me) then
    raise exception 'request_not_allowed' using errcode = 'P0001';
  end if;
  update public.friendships set state = 'accepted', accepted_at = now()
   where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  perform ops.notify(other, 'friend_accepted', 'friend_accepted:' || me::text,
                     jsonb_build_object('actor_name', private.friend_display_name(me)), me);
  return 'friends';
end $$;

-- Unfriend, cancel my request, or clear someone's request to me (= decline).
-- Always succeeds (nothing to remove is fine), so it reveals nothing.
create function public.remove_friend(other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f  public.friendships%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into f from public.friendships
   where user_a_id = least(me, other) and user_b_id = greatest(me, other)
   for update;
  if not found then
    return;
  end if;
  if f.state = 'accepted' then
    delete from public.friendships where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  elsif f.state = 'pending' and f.requested_by = me then
    delete from public.friendships where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  elsif f.state = 'pending' then
    update public.friendships set state = 'declined', declined_at = now()
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  elsif f.requested_by = me then  -- declined, mine: hide it from me, keep the cooldown
    update public.friendships set requester_withdrew = true
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  end if;
end $$;

-- The caller's friendships, from the caller's point of view.
--   status  'friends' | 'incoming' (they asked me) | 'outgoing' (I asked)
-- A request I declined is gone from my list; a request of mine that was
-- declined still reads 'outgoing' (see the header).
create function public.my_friendships()
returns table (user_id uuid, username text, display_name text, avatar_media_id uuid,
               status text, since timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when f.user_a_id = auth.uid() then f.user_b_id else f.user_a_id end as other,
           case
             when f.state = 'accepted' then 'friends'
             when f.requested_by = auth.uid() then 'outgoing'
             else 'incoming'
           end as status,
           coalesce(f.accepted_at, f.created_at) as since
      from public.friendships f
     where auth.uid() in (f.user_a_id, f.user_b_id)
       and (f.state <> 'declined' or (f.requested_by = auth.uid() and not f.requester_withdrew))
  )
  select m.other, p.username::text, p.display_name, p.avatar_media_id, m.status, m.since
    from mine m join public.profiles p on p.user_id = m.other
   order by m.since desc;
$$;

-- Exact username lookup for "Add friends". NOT search: one exact match or
-- nothing, public profile basics only, profiles RLS applies (blocked = nothing).
create function public.find_user_by_username(name text)
returns table (user_id uuid, username text, display_name text, avatar_media_id uuid)
language sql stable security invoker set search_path = public as $$
  select p.user_id, p.username::text, p.display_name, p.avatar_media_id
    from public.public_profiles p
   where auth.uid() is not null
     and p.username = btrim(ltrim(btrim(coalesce(name, '')), '@'))::citext
   limit 1;
$$;

-- ---------------------------------------------------------------- blocks end friendships
create function private.block_ends_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where user_a_id = least(new.blocker_id, new.blocked_id)
     and user_b_id = greatest(new.blocker_id, new.blocked_id);
  return new;
end $$;

create trigger blocks_end_friendship
  after insert on public.blocks
  for each row execute function private.block_ends_friendship();

-- ---------------------------------------------------------------- privileges
revoke execute on function private.are_friends(uuid, uuid)            from public, anon, authenticated;
revoke execute on function private.may_befriend(uuid, uuid)           from public, anon, authenticated;
revoke execute on function private.friend_display_name(uuid)          from public, anon, authenticated;
revoke execute on function private.notify_friend_request(uuid, uuid)  from public, anon, authenticated;
revoke execute on function private.block_ends_friendship()            from public, anon, authenticated;

revoke execute on function public.request_friend(uuid)          from public, anon;
revoke execute on function public.respond_friend(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid)           from public, anon;
revoke execute on function public.my_friendships()              from public, anon;
revoke execute on function public.find_user_by_username(text)   from public, anon;
grant  execute on function public.request_friend(uuid)          to authenticated;
grant  execute on function public.respond_friend(uuid, boolean) to authenticated;
grant  execute on function public.remove_friend(uuid)           to authenticated;
grant  execute on function public.my_friendships()              to authenticated;
grant  execute on function public.find_user_by_username(text)   to authenticated;
