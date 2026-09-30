-- ============================================================================
-- 018 — Friendship hardening (review of 014).
--
-- 1. Block → unblock no longer resets the 30-day decline cooldown: a block
--    ends accepted and pending friendships, but KEEPS a declined row (it is
--    only a cooldown record; it grants nothing).
-- 2. Per-requester daily cap: at most 20 new friend requests in 24 hours.
--    Over the cap, request_friend answers 'requested' exactly as usual but
--    writes nothing and notifies no one (a silent no-op, like the cooldown).
--    Accepting someone who asked you first is never capped.
-- 3. A→B and B→A asking at the same instant: the first insert wins
--    (on conflict do nothing), the loser re-reads the row and takes the
--    normal path, so the second ask accepts instead of raising 23505.
-- ============================================================================

create or replace function private.block_ends_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where user_a_id = least(new.blocker_id, new.blocked_id)
     and user_b_id = greatest(new.blocker_id, new.blocked_id)
     and state in ('accepted', 'pending');
  return new;
end $$;

create or replace function private.friend_request_cap() returns int
language sql immutable as $$ select 20 $$;

-- Requests `u` started in the last 24 hours (rows whose current request is theirs).
create or replace function private.friend_requests_today(u uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.friendships
   where requested_by = u and created_at > now() - interval '24 hours';
$$;

create or replace function public.request_friend(target uuid) returns text
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
    if private.friend_requests_today(me) >= private.friend_request_cap() then
      return 'requested';  -- over the daily cap: looks the same, does nothing
    end if;
    insert into public.friendships (user_a_id, user_b_id, requested_by)
    values (least(me, target), greatest(me, target), me)
    on conflict do nothing;
    if found then
      perform private.notify_friend_request(me, target);
      return 'requested';
    end if;
    -- They asked at the same moment: their row exists now; take the normal path.
    select * into f from public.friendships
     where user_a_id = least(me, target) and user_b_id = greatest(me, target)
     for update;
  end if;

  if f.state = 'accepted' then
    return 'friends';
  end if;

  if f.state = 'pending' and f.requested_by = target then
    update public.friendships set state = 'accepted', accepted_at = now()
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
    perform ops.notify(target, 'friend_accepted', 'friend_accepted:' || me::text,
                       jsonb_build_object('actor_name', private.friend_display_name(me)), me);
    return 'friends';
  end if;

  if f.state = 'pending' then
    return 'requested';
  end if;

  -- declined
  if f.requested_by = me and f.declined_at > now() - interval '30 days' then
    update public.friendships set requester_withdrew = false
     where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
    return 'requested';
  end if;
  if private.friend_requests_today(me) >= private.friend_request_cap() then
    return 'requested';
  end if;
  update public.friendships
     set state = 'pending', requested_by = me, created_at = now(),
         declined_at = null, requester_withdrew = false
   where user_a_id = f.user_a_id and user_b_id = f.user_b_id;
  perform private.notify_friend_request(me, target);
  return 'requested';
end $$;

revoke execute on function private.friend_request_cap()         from public, anon, authenticated;
revoke execute on function private.friend_requests_today(uuid)  from public, anon, authenticated;
revoke execute on function public.request_friend(uuid)          from public, anon;
grant  execute on function public.request_friend(uuid)          to authenticated;
