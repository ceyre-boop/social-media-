-- Migration 022: settings — friend request permissions (enforced in the DB,
-- generic refusal), default chat strictness, data export requests, account
-- deletion requests (7-day grace, cancellable, own rows only).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.try(stmt text) returns text language plpgsql as $f$
declare out text;
begin
  execute stmt into out;
  return 'ok:' || coalesce(out, '');
exception when others then
  return sqlstate || ':' || sqlerrm;
end $f$;

create function pg_temp.probe(stmt text) returns text language plpgsql as $f$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    raise exception using errcode = 'PX999', message = 'ok:' || n;
  exception when others then
    if sqlstate = 'PX999' then return sqlerrm; end if;
    return sqlstate;
  end;
end $f$;

-- alice 1111 · bob 2222 · carol 4444 · dave 5555 (adults, seed.sql)
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set carol '''44444444-4444-4444-8444-444444444444'''
\set dave  '''55555555-5555-4555-8555-555555555555'''

delete from public.follows;
delete from public.friendships;

-- ------------------------------------------------------------------ friend request permission
select is((select friend_requests_from::text from public.users where id = :bob), 'everyone', 'default is everyone');

set local role authenticated;
select pg_temp.act_as(:bob);
select is(pg_temp.probe($$update public.users set friend_requests_from = 'nobody' where id = '22222222-2222-4222-8222-222222222222'$$),
          'ok:1', 'bob can set who may ask him');
select is(pg_temp.probe($$update public.users set friend_requests_from = 'nobody' where id = '11111111-1111-4111-8111-111111111111'$$),
          'ok:0', 'bob cannot change alice''s setting');
select is(pg_temp.probe($$update public.users set friend_requests_from = 'bogus' where id = '22222222-2222-4222-8222-222222222222'$$),
          '22P02', 'only the three choices exist');
update public.users set friend_requests_from = 'nobody' where id = :bob;

select pg_temp.act_as(:alice);
select is(pg_temp.try($$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'P0001:request_not_allowed', 'nobody: alice is refused with the generic error');
select is(pg_temp.try($$select public.request_friend('99999999-9999-4999-8999-999999999999')$$),
          'P0001:request_not_allowed', 'the refusal is identical for a person who does not exist');
reset role;
select is((select count(*)::int from public.friendships), 0, 'no row was created');

-- following: only people bob follows
set local role authenticated;
select pg_temp.act_as(:bob);
update public.users set friend_requests_from = 'following' where id = :bob;
select pg_temp.act_as(:alice);
select is(pg_temp.try($$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'P0001:request_not_allowed', 'following: alice is refused while bob does not follow her');
select pg_temp.act_as(:bob);
insert into public.follows (follower_id, followee_id) values (:bob, :alice);
select pg_temp.act_as(:alice);
select is(pg_temp.try($$select public.request_friend('22222222-2222-4222-8222-222222222222')$$),
          'ok:requested', 'following: alice may ask once bob follows her');
-- bob can still accept after switching to nobody (the pair is already in motion)
select pg_temp.act_as(:bob);
update public.users set friend_requests_from = 'nobody' where id = :bob;
select is(pg_temp.try($$select public.respond_friend('11111111-1111-4111-8111-111111111111', true)$$),
          'ok:friends', 'a pending request can still be accepted after switching to nobody');
reset role;

-- asking back someone who asked first is never blocked by your own setting
set local role authenticated;
select pg_temp.act_as(:carol);
select is(pg_temp.try($$select public.request_friend('55555555-5555-4555-8555-555555555555')$$), 'ok:requested', 'carol asks dave first');
select pg_temp.act_as(:dave);
update public.users set friend_requests_from = 'nobody' where id = :dave;
select is(pg_temp.try($$select public.request_friend('44444444-4444-4444-8444-444444444444')$$),
          'ok:friends', 'asking back someone who already asked you accepts, whatever your setting');
reset role;

-- ------------------------------------------------------------------ default room level (was default chat strictness; 024)
select is((select default_room_level::text from public.users where id = :alice), 'standard', 'default room level is standard');
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$update public.users set default_room_level = 'family' where id = '11111111-1111-4111-8111-111111111111'$$),
          'ok:1', 'alice can set her default room level');
update public.users set default_room_level = 'family' where id = :alice;
reset role;
insert into public.live_streams (id, host_id, status, provider)
values ('cf000000-0000-4000-8000-0000000000bb', :alice, 'scheduled', 'test');
select is((select room_level::text from public.live_streams where id = 'cf000000-0000-4000-8000-0000000000bb'),
          'family', 'a new stream starts at the host''s default');
insert into public.live_streams (id, host_id, status, provider, room_level)
values ('cf000000-0000-4000-8000-0000000000bc', :alice, 'scheduled', 'test', 'open');
select is((select room_level::text from public.live_streams where id = 'cf000000-0000-4000-8000-0000000000bc'),
          'open', 'an explicit non-default choice on the stream wins');

-- ------------------------------------------------------------------ data export
select has_table('public', 'data_export_requests', 'data_export_requests exists');
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe(format($$insert into public.data_export_requests (user_id) values (%L)$$, :alice)),
          'ok:1', 'alice can request an export');
insert into public.data_export_requests (user_id) values (:alice);
select is((select status from public.data_export_requests where user_id = :alice), 'requested', 'status starts as requested');
select is(pg_temp.probe(format($$insert into public.data_export_requests (user_id) values (%L)$$, :alice)),
          '23505', 'one open request at a time');
select is(pg_temp.probe(format($$insert into public.data_export_requests (user_id) values (%L)$$, :bob)),
          '42501', 'cannot request on someone else''s behalf');
select is(pg_temp.probe(format($$insert into public.data_export_requests (user_id, status) values (%L, 'ready')$$, :carol)),
          '42501', 'cannot set the status');
select pg_temp.act_as(:bob);
select is(pg_temp.probe($$select 1 from public.data_export_requests$$), 'ok:0', 'bob cannot read alice''s request');
reset role;

-- ------------------------------------------------------------------ account deletion
select has_table('public', 'account_deletion_requests', 'account_deletion_requests exists');
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.try($$select public.request_account_deletion('wrong-name')$$),
          'P0001:confirmation_mismatch', 'the typed username must match');
select is((select count(*)::int from public.account_deletion_requests), 0, 'a wrong confirmation creates nothing');
select ok((public.request_account_deletion((select username::text from public.profiles where user_id = :alice)))
            between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour',
          'a matching username schedules deletion about 7 days out');
select is(pg_temp.probe($$insert into public.account_deletion_requests (user_id) values ('11111111-1111-4111-8111-111111111111')$$),
          '42501', 'no direct inserts');
select pg_temp.act_as(:bob);
select is(pg_temp.probe($$select 1 from public.account_deletion_requests$$), 'ok:0', 'bob cannot see alice''s request');
select is(public.cancel_account_deletion(), false, 'nothing to cancel for bob');
select pg_temp.act_as(:alice);
select is(public.cancel_account_deletion(), true, 'alice cancels her pending deletion');
select is((select status from public.account_deletion_requests where user_id = :alice), 'cancelled', 'the request is marked cancelled');
reset role;
select is((select count(*)::int from public.users where id = :alice and deleted_at is null), 1, 'nothing was deleted');

-- ------------------------------------------------------------------ blocked users
insert into public.blocks (blocker_id, blocked_id) values (:alice, :carol);
set local role authenticated;
select pg_temp.act_as(:alice);
select is((select count(*)::int from public.my_blocked_users()), 1, 'alice sees her blocked list');
select is((select user_id from public.my_blocked_users()), :carol::uuid, 'with the blocked person named');
select pg_temp.act_as(:carol);
select is((select count(*)::int from public.my_blocked_users()), 0, 'the blocked person sees nothing (and learns nothing)');
reset role;

select * from finish();
rollback;
