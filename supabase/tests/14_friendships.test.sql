-- Migration 014: explicit friendships — canonical pair rows, RPC-only writes,
-- age and block rules with one generic refusal, decline opacity + 30-day
-- cooldown, privacy, notifications.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs a statement; returns 'ok:<result>' or '<sqlstate>:<message>'.
create function pg_temp.try(stmt text) returns text language plpgsql as $f$
declare out text;
begin
  execute stmt into out;
  return 'ok:' || coalesce(out, '');
exception when others then
  return sqlstate || ':' || sqlerrm;
end $f$;

create function pg_temp.read(q text) returns text language plpgsql as $f$
declare out text;
begin
  execute format('select coalesce(string_agg(t::text, '';''), ''<no rows>'') from (%s) t', q) into out;
  return out;
exception when others then
  return sqlstate;
end $f$;

-- seed: alice 1111 adult · bob 2222 adult · minnie 3333 minor (15)
--       carol 4444 adult · dave 5555 adult. alice/minnie are not connected.
create function pg_temp.u(name text) returns uuid language sql immutable as $$
  select case name
    when 'alice'  then '11111111-1111-4111-8111-111111111111'
    when 'bob'    then '22222222-2222-4222-8222-222222222222'
    when 'minnie' then '33333333-3333-4333-8333-333333333333'
    when 'carol'  then '44444444-4444-4444-8444-444444444444'
    when 'dave'   then '55555555-5555-4555-8555-555555555555'
  end::uuid;
$$;

create function pg_temp.as_user(name text, stmt text) returns text language plpgsql as $f$
declare out text;
begin
  perform pg_temp.act_as(pg_temp.u(name));
  execute 'set local role authenticated';
  out := pg_temp.try(stmt);
  execute 'reset role';
  return out;
end $f$;

create function pg_temp.view_of(name text) returns text language plpgsql as $f$
declare out text;
begin
  perform pg_temp.act_as(pg_temp.u(name));
  execute 'set local role authenticated';
  out := pg_temp.read($$select username, status from public.my_friendships() order by username$$);
  execute 'reset role';
  return out;
end $f$;

create function pg_temp.notes(target text, kind text, actor text) returns int language sql as $$
  select count(*)::int from public.notifications
   where user_id = pg_temp.u(target) and kind = $2 and actor_id = pg_temp.u(actor);
$$;

-- ------------------------------------------------------------------ shape
select has_table('public', 'friendships', 'friendships exists');
select hasnt_column('public', 'friendships', 'requester_id', 'the v0.1 requester/addressee shape is gone');
select is((select count(*)::int from pg_type where typname = 'friend_status'), 0, 'friend_status enum dropped');
select throws_ok(
  $$insert into public.friendships (user_a_id, user_b_id, requested_by)
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222')$$,
  '23514', null, 'canonical ordering: user_a_id < user_b_id is enforced');

-- ------------------------------------------------------------------ request / accept
select is(pg_temp.as_user('alice', $$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'ok:requested', 'alice asks bob');
select is(pg_temp.read($$select user_a_id = least('11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid), state, requested_by = '11111111-1111-4111-8111-111111111111' from public.friendships
                        where user_a_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
                          and user_b_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')$$),
          '(t,pending,t)', 'one canonical pending row, requested_by alice');
select is(pg_temp.notes('bob', 'friend_request', 'alice'), 1, 'bob is notified of the request');
select is((select data->>'actor_name' from public.notifications where user_id = pg_temp.u('bob') and kind = 'friend_request'),
          'Alice', 'the notification carries the requester''s name for the copy');
select is((select count(*)::int from ops.job_queue where kind = 'push' and payload->>'user_id' = pg_temp.u('bob')::text
             and payload->>'type' = 'friend_request'), 1, 'a push job is enqueued via ops.notify');
select is(pg_temp.view_of('alice'), '(bob,outgoing)', 'alice sees her outgoing request');
select is(pg_temp.view_of('bob'),   '(alice,incoming)', 'bob sees the incoming request');

select is(pg_temp.as_user('alice', $$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'ok:requested', 'asking again is a harmless no-op');
select is((select count(*)::int from public.friendships where requested_by = pg_temp.u('alice')), 1, 'still one row per pair');
select is(pg_temp.notes('bob', 'friend_request', 'alice'), 1, 'asking again does not notify again');

select is(pg_temp.as_user('alice', $$select public.respond_friend('22222222-2222-4222-8222-222222222222', true)$$),
          'P0001:request_not_allowed', 'the requester cannot answer their own request');
select is(pg_temp.as_user('bob', $$select public.respond_friend('11111111-1111-4111-8111-111111111111', true)$$),
          'ok:friends', 'bob accepts');
select is(private.are_friends(pg_temp.u('alice'), pg_temp.u('bob')), true, 'are_friends(alice, bob)');
select is(private.are_friends(pg_temp.u('bob'), pg_temp.u('alice')), true, 'are_friends is symmetric');
select is(pg_temp.notes('alice', 'friend_accepted', 'bob'), 1, 'alice is notified that bob accepted');
select is(pg_temp.view_of('alice'), '(bob,friends)', 'alice: friends');
select is(pg_temp.view_of('bob'),   '(alice,friends)', 'bob: friends');

-- ------------------------------------------------------------------ privacy
select is(pg_temp.view_of('carol'), '<no rows>', 'a third person sees nothing about alice and bob');
select is(pg_temp.as_user('carol', $$select count(*)::text from public.friendships$$),
          '42501:permission denied for table friendships', 'clients cannot read the table directly');
select is(pg_temp.as_user('alice', $$select count(*)::text from public.friendships$$),
          '42501:permission denied for table friendships', 'not even the parties (they read my_friendships)');
select is(pg_temp.as_user('alice', $$insert into public.friendships (user_a_id, user_b_id, requested_by) values ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111') returning 'x'$$),
          '42501:permission denied for table friendships', 'clients never insert raw rows');
select is(pg_temp.as_user('alice', $$select private.are_friends('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444')::text$$),
          '42501:permission denied for function are_friends', 'are_friends is not a client oracle');
set local role anon;
select is(pg_temp.try($$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          '42501:permission denied for function request_friend', 'anon cannot request');
reset role;

-- ------------------------------------------------------------------ remove
select is(pg_temp.as_user('alice', $$select public.remove_friend('22222222-2222-4222-8222-222222222222')::text$$),
          'ok:', 'alice unfriends bob');
select is(private.are_friends(pg_temp.u('alice'), pg_temp.u('bob')), false, 'no longer friends');
select is(pg_temp.view_of('bob'), '<no rows>', 'bob''s list is empty again');
select is(pg_temp.as_user('alice', $$select public.remove_friend('22222222-2222-4222-8222-222222222222')::text$$),
          'ok:', 'removing nothing is fine (reveals nothing)');

-- ------------------------------------------------------------------ age rules, one generic refusal
select is(pg_temp.as_user('alice', $$select public.request_friend('33333333-3333-4333-8333-333333333333')$$),
          'P0001:request_not_allowed', 'adult → unconnected minor is refused');
select is(pg_temp.as_user('alice', $$select public.request_friend('99999999-9999-4999-8999-999999999999')$$),
          'P0001:request_not_allowed', 'nonexistent person: the same generic refusal');
select is(pg_temp.as_user('alice', $$select public.request_friend('11111111-1111-4111-8111-111111111111')$$),
          'P0001:request_not_allowed', 'yourself: the same generic refusal');
select is((select count(*)::int from public.notifications where user_id = pg_temp.u('minnie')), 0, 'the minor was never notified');

select is(pg_temp.as_user('minnie', $$select public.request_friend('11111111-1111-4111-8111-111111111111')$$),
          'ok:requested', 'minor → adult is allowed');
select is(pg_temp.as_user('alice', $$select public.respond_friend('33333333-3333-4333-8333-333333333333', true)$$),
          'ok:friends', 'the adult may accept a minor''s request');
select is(private.are_friends(pg_temp.u('alice'), pg_temp.u('minnie')), true, 'alice and minnie are friends');

-- ------------------------------------------------------------------ blocks
select is(pg_temp.as_user('carol', $$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'ok:requested', 'carol asks bob');
select is(pg_temp.as_user('bob', $$select public.respond_friend('44444444-4444-4444-8444-444444444444', true)$$),
          'ok:friends', 'bob accepts carol');
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('bob'), pg_temp.u('carol'));
select is(private.are_friends(pg_temp.u('bob'), pg_temp.u('carol')), false, 'blocking ends the friendship');
select is(pg_temp.as_user('carol', $$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'P0001:request_not_allowed', 'the blocked person cannot ask again: same generic refusal');
select is(pg_temp.as_user('bob', $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'P0001:request_not_allowed', 'nor can the blocker ask across their own block');

-- ------------------------------------------------------------------ decline: opaque, 30-day cooldown
select is(pg_temp.as_user('dave', $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:requested', 'dave asks carol');
select is(pg_temp.as_user('carol', $$select public.respond_friend('55555555-5555-4555-8555-555555555555', false)$$),
          'ok:declined', 'carol declines');
select is(pg_temp.view_of('dave'),  '(carol,outgoing)', 'to dave a declined request looks exactly like a pending one');
select is(pg_temp.view_of('carol'), '<no rows>', 'carol no longer sees it');
select is(pg_temp.notes('dave', 'friend_accepted', 'carol'), 0, 'declining never notifies');
select is(pg_temp.as_user('dave', $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:requested', 'dave asking again inside 30 days looks like success…');
select is((select state from public.friendships where requested_by = pg_temp.u('dave')), 'declined',
          '…but stays declined: no re-request for 30 days');
select is(pg_temp.view_of('carol'), '<no rows>', 'and carol is not asked again');

update public.friendships set declined_at = now() - interval '31 days' where requested_by = pg_temp.u('dave');
select is(pg_temp.as_user('dave', $$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:requested', 'after 30 days dave may ask again');
select is(pg_temp.view_of('carol'), '(dave,incoming)', 'carol sees the new request');

select is(pg_temp.as_user('carol', $$select public.remove_friend('55555555-5555-4555-8555-555555555555')::text$$),
          'ok:', 'clearing an incoming request declines it');
select is(pg_temp.as_user('dave', $$select public.remove_friend('44444444-4444-4444-8444-444444444444')::text$$),
          'ok:', 'dave withdraws (it was declined, unknown to him)');
select is(pg_temp.view_of('dave'), '<no rows>', 'it disappears from dave''s list');
select is((select state from public.friendships where requested_by = pg_temp.u('dave')), 'declined',
          'the row and its cooldown stay, so withdraw + re-ask cannot dodge it');
select is(pg_temp.as_user('carol', $$select public.request_friend('55555555-5555-4555-8555-555555555555')$$),
          'ok:requested', 'the person who declined may still ask later');
select is(pg_temp.view_of('dave'), '(carol,incoming)', 'dave sees carol''s request');

-- ------------------------------------------------------------------ asking each other
select is(pg_temp.as_user('bob', $$select public.request_friend('55555555-5555-4555-8555-555555555555')$$),
          'ok:requested', 'bob asks dave');
select is(pg_temp.as_user('dave', $$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'ok:friends', 'dave asking bob back accepts');

-- ------------------------------------------------------------------ exact username lookup
select is(pg_temp.as_user('alice', $$select username from public.find_user_by_username('bob')$$),
          'ok:bob', 'exact username finds the person');
select is(pg_temp.as_user('alice', $$select username from public.find_user_by_username('@BOB ')$$),
          'ok:bob', 'case, a leading @ and spaces are forgiven');
select is(pg_temp.as_user('alice', $$select username from public.find_user_by_username('bo')$$),
          'ok:', 'a prefix finds nobody: this is not search');
select is(pg_temp.as_user('carol', $$select username from public.find_user_by_username('bob')$$),
          'ok:', 'a blocked person cannot be found');
set local role anon;
select is(pg_temp.try($$select username from public.find_user_by_username('bob')$$),
          '42501:permission denied for function find_user_by_username', 'anon cannot look people up');
reset role;

select * from finish();
rollback;
