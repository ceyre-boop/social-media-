-- Migration 018: a block keeps the decline cooldown, per-requester daily cap,
-- and simultaneous A→B / B→A requests resolve to friends (not 23505).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.u(name text) returns uuid language sql immutable as $$
  select case name
    when 'alice' then '11111111-1111-4111-8111-111111111111'
    when 'bob'   then '22222222-2222-4222-8222-222222222222'
    when 'carol' then '44444444-4444-4444-8444-444444444444'
    when 'dave'  then '55555555-5555-4555-8555-555555555555'
  end::uuid;
$$;

create function pg_temp.as_user(uid uuid, stmt text) returns text language plpgsql as $f$
declare out text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute stmt into out;
    out := 'ok:' || coalesce(out, '');
  exception when others then
    out := sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return out;
end $f$;

create function pg_temp.pair_state(a text, b text) returns text language sql as $$
  select coalesce((select state from public.friendships
                    where user_a_id = least(pg_temp.u(a), pg_temp.u(b))
                      and user_b_id = greatest(pg_temp.u(a), pg_temp.u(b))), '<none>');
$$;

-- ------------------------------------------------------------------ block keeps the cooldown
select is(pg_temp.as_user(pg_temp.u('bob'), $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:requested', 'bob asks carol');
select is(pg_temp.as_user(pg_temp.u('carol'), $$select public.respond_friend('22222222-2222-4222-8222-222222222222', false)$$),
          'ok:declined', 'carol declines');
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('carol'), pg_temp.u('bob'));
select is(pg_temp.pair_state('bob', 'carol'), 'declined', 'a block keeps the declined row (it is only a cooldown record)');
delete from public.blocks where blocker_id = pg_temp.u('carol') and blocked_id = pg_temp.u('bob');
select is(pg_temp.as_user(pg_temp.u('bob'), $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:requested', 'after unblock, bob asking again looks like success…');
select is(pg_temp.pair_state('bob', 'carol'), 'declined', '…but is still a silent no-op inside 30 days');
select is((select count(*)::int from public.notifications
            where user_id = pg_temp.u('carol') and kind = 'friend_request' and actor_id = pg_temp.u('bob')), 1,
          'carol was notified only the first time');

-- A block still ends accepted friendships (and pending requests).
do $d$ begin perform pg_temp.as_user(pg_temp.u('alice'), $q$select public.request_friend('55555555-5555-4555-8555-555555555555')$q$); end $d$;
do $d$ begin perform pg_temp.as_user(pg_temp.u('dave'), $q$select public.respond_friend('11111111-1111-4111-8111-111111111111', true)$q$); end $d$;
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('dave'), pg_temp.u('alice'));
select is(pg_temp.pair_state('alice', 'dave'), '<none>', 'a block still ends an accepted friendship');
delete from public.blocks where blocker_id = pg_temp.u('dave') and blocked_id = pg_temp.u('alice');

-- ------------------------------------------------------------------ daily cap (20)
-- 20 fresh people for alice to ask.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'cap' || i || '@example.com', '{"date_of_birth":"1990-01-01"}'::jsonb, now(), now()
  from generate_series(1, 21) i;
insert into public.profiles (user_id, username)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'cap_user_' || i from generate_series(1, 21) i;
update public.friendships set created_at = now() - interval '2 days' where requested_by = pg_temp.u('alice');

do $$
begin
  for i in 1 .. 20 loop
    perform pg_temp.as_user(pg_temp.u('alice'),
      format($q$select public.request_friend(%L)$q$, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0')));
  end loop;
end $$;
select is((select count(*)::int from public.friendships where requested_by = pg_temp.u('alice') and state = 'pending'
             and created_at > now() - interval '24 hours'), 20, '20 requests in a day go through');
select is(pg_temp.as_user(pg_temp.u('alice'), $$select public.request_friend('00000000-0000-4000-8000-000000000021')$$),
          'ok:requested', 'the 21st looks the same…');
select is((select count(*)::int from public.friendships
            where user_b_id = '00000000-0000-4000-8000-000000000021' or user_a_id = '00000000-0000-4000-8000-000000000021'),
          0, '…but writes nothing');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-8000-000000000021'), 0,
          '…and notifies no one');

-- ------------------------------------------------------------------ simultaneous asks
-- A true two-session race needs dblink, which the local stack's non-superuser
-- postgres role can't open over trust auth. The race is reproduced exactly
-- instead: carol's request is not visible when dave's request_friend looks,
-- and lands just before dave's insert (a BEFORE INSERT trigger writes it), so
-- dave's insert conflicts. It must resolve to friends, not raise 23505.
create function pg_temp.carol_asks_first() returns trigger language plpgsql as $$
begin
  if new.requested_by = '55555555-5555-4555-8555-555555555555'::uuid then
    insert into public.friendships (user_a_id, user_b_id, requested_by)
    values (new.user_a_id, new.user_b_id, '44444444-4444-4444-8444-444444444444')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger zz_race before insert on public.friendships
  for each row execute function pg_temp.carol_asks_first();
select is(pg_temp.as_user(pg_temp.u('dave'), $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:friends', 'the second of two simultaneous asks accepts instead of failing on the unique key');
drop trigger zz_race on public.friendships;
select is(pg_temp.pair_state('carol', 'dave'), 'accepted', 'carol and dave are friends');


select * from finish();
rollback;
