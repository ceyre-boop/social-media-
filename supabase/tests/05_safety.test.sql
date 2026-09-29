-- Child safety (DM + live gating), report shape, counters.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- can_dm
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  false, 'adult and unconnected minor cannot DM');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  true, 'two age-verified adults can DM');

-- One-way follow is not enough for a minor; an adult friendship is not a minor path.
insert into public.follows (follower_id, followee_id)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'accepted');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  false, 'one-way follow + friendship does not open DMs with a minor');

insert into public.follows (follower_id, followee_id)
values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  true, 'mutual follow is the minor''s DM path');

insert into public.blocks (blocker_id, blocked_id)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  false, 'a block overrides every DM path');
delete from public.blocks;
delete from public.follows;
delete from public.friendships;

-- Counters follow the follow graph
select is((select follower_count from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint, 'follower_count decremented back to 0 after unfollow');

-- messages trigger enforces can_dm against every other member
insert into public.conversations (id, created_by)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
insert into public.conversation_members (conversation_id, user_id) values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('ffffffff-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'hi')$$,
  'P0001', 'dm_not_allowed', 'adult cannot message an unconnected minor');

-- Live is 18+ verified only
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$insert into public.live_streams (host_id, provider) values ('33333333-3333-4333-8333-333333333333', 'livekit')$$,
  'P0001', 'live_requires_verified_adult', 'live insert by a minor raises');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$insert into public.live_streams (host_id, provider) values ('11111111-1111-4111-8111-111111111111', 'livekit')$$,
  'verified adult can go live');

-- Reports: exactly one target
select throws_ok(
  $$insert into public.reports (reporter_id, target_user_id, target_post_id, reason)
    values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-0000-4000-8000-000000000001', 'spam')$$,
  '23514', null, 'report with two targets raises');
select lives_ok(
  $$insert into public.reports (reporter_id, target_user_id, reason)
    values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'spam')$$,
  'report with one target works');

-- Reporters see their own reports; non-moderators don't see others'
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.reports), 0, 'non-moderator cannot see other people''s reports');

-- Moderators see the queue
reset role;
update public.users set app_role = 'moderator' where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((select count(*)::int from public.reports), 1, 'moderator sees the report queue');

-- reach_events explanation must be non-empty
reset role;
select throws_ok(
  $$insert into public.reach_events (post_id, reason, explanation)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'duplicate_content', '   ')$$,
  '23514', null, 'reach_events explanation cannot be blank');

select * from finish();
rollback;
