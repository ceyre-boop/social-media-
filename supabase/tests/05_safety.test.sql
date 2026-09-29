-- Child safety and DM rules (brief §7): helper privacy, can_dm, message and
-- member-join gating, live gating, message requests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Runs a DML statement as the current role and returns the affected row count.
create function pg_temp.affected(stmt text) returns int language plpgsql as $f$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $f$;
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ----------------------------------------------- helpers are not client-callable
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select throws_ok($$select public.is_adult('33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'authenticated cannot execute is_adult (no probing ages)');
select throws_ok($$select public.is_age_verified_adult('44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'authenticated cannot execute is_age_verified_adult');
select throws_ok($$select public.can_dm('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'authenticated cannot execute can_dm');
select throws_ok($$select public.relationship_state('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'authenticated cannot execute relationship_state');
select throws_ok($$select public.is_mutual('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'authenticated cannot execute is_mutual');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.is_adult('33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'anon cannot execute is_adult');
reset role;

-- ------------------------------------------------------------------ can_dm
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  true,  'alice ↔ bob (mutual regular) can DM');
select is(public.can_dm('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333'),
  false, 'dave (adult) → minnie (minor), no mutual: cannot DM');
select is(public.can_dm('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555'),
  false, 'minnie (minor) → dave, no mutual: cannot DM');
select is(public.can_dm('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'),
  false, 'carol (unverified adult) ↔ dave, no mutual: cannot DM');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555'),
  true,  'alice ↔ dave, both age-verified adults: can DM without a relationship');

-- --------------------------------------------- messages: mutual adults (C1)
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222');
insert into public.conversation_members (conversation_id, user_id) values
  ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222'),
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'hi alice')$$,
  'bob → alice (mutual) message insert succeeds');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.messages
           where conversation_id = 'c0000000-0000-4000-8000-000000000001'),
  1, 'alice reads bob''s message');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from public.messages
           where conversation_id = 'c0000000-0000-4000-8000-000000000001'),
  0, 'dave cannot read a conversation he is not in');
reset role;

-- A block overrides the mutual relationship.
insert into public.blocks (blocker_id, blocked_id)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
select is(public.can_dm('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  false, 'a block overrides mutual: alice ↔ bob can no longer DM');
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'still there?')$$,
  'P0001', 'dm_not_allowed', 'bob cannot message alice across a block');
reset role;
delete from public.blocks;

-- ------------------------------------------ messages: minor ↔ adult (C2)
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555')$$,
  'P0001', 'member_join_not_allowed', 'dave cannot even be added to a conversation with minnie');

-- Build the conversation while they are mutual, then remove the relationship:
-- the send-time check must still stop both directions.
insert into public.relationships (actor_id, subject_id, state, distinct_weeks, interaction_count,
                                  first_seen_at, last_seen_at) values
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'regular', 4, 4, now(), now()),
  ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', 'regular', 4, 4, now(), now());
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555');

set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'hi (mutual)')$$,
  'minnie → dave succeeds while they are mutual regulars (the minor''s only DM path)');
reset role;
delete from public.relationships
where (actor_id, subject_id) in (('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333'),
                                 ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555'));

set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'hi dave')$$,
  'P0001', 'dm_not_allowed', 'minnie cannot insert a message to dave without a mutual relationship');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'hi minnie')$$,
  'P0001', 'dm_not_allowed', 'an adult (dave) cannot message minnie without a mutual relationship');

-- Adult writes into a solo conversation, then tries to add the minor.
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555');
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555');
insert into public.messages (conversation_id, sender_id, body)
values ('c0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555', 'pre-written');
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'member_join_not_allowed',
  'an adult cannot add a minor to a conversation to expose pre-written messages');
reset role;

-- ------------------------------------------------------------------- live
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$insert into public.live_streams (host_id, provider) values ('33333333-3333-4333-8333-333333333333', 'test')$$,
  'P0001', 'live_requires_verified_adult', 'minnie cannot insert a live stream');
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select throws_ok(
  $$insert into public.live_streams (host_id, provider) values ('44444444-4444-4444-8444-444444444444', 'test')$$,
  'P0001', 'live_requires_verified_adult', 'carol (adult, unverified) cannot insert a live stream');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$insert into public.live_streams (host_id, provider) values ('11111111-1111-4111-8111-111111111111', 'test')$$,
  'alice (verified adult) can insert a live stream');

-- -------------------------------------------------------- message requests
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id)
    values ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'message_request_requires_adults', 'an adult cannot send a message request to a minor');

-- carol (unverified; cannot DM dave) holds a first message in a solo
-- conversation and requests dave.
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444');
select lives_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444')$$,
  'carol creates a conversation with herself as the only member');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 'secret first message')$$,
  'carol writes the held first message');
select lives_ok(
  $$insert into public.message_requests (id, sender_id, recipient_id, conversation_id)
    values ('d0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555', 'c0000000-0000-4000-8000-000000000004')$$,
  'carol sends a message request to dave');
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id)
    values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'carol cannot send a request as someone else');
select is(
  pg_temp.affected($$update public.message_requests set status = 'accepted'
                      where id = 'd0000000-0000-4000-8000-000000000001'$$),
  0, 'the sender cannot accept her own request');

select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select sender_id from public.message_requests_inbox
           where id = 'd0000000-0000-4000-8000-000000000001'),
  '44444444-4444-4444-8444-444444444444'::uuid, 'dave sees carol''s request in his inbox');
select is((select count(*)::int from public.messages
           where conversation_id = 'c0000000-0000-4000-8000-000000000004'),
  0, 'before acceptance dave cannot read the held message body');
select lives_ok(
  $$update public.message_requests set status = 'accepted'
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'dave (recipient) accepts the request');
select is((select body from public.messages
           where conversation_id = 'c0000000-0000-4000-8000-000000000004'),
  'secret first message', 'after acceptance dave can read the held message');
select throws_ok(
  $$update public.message_requests set status = 'declined'
    where id = 'd0000000-0000-4000-8000-000000000001'$$,
  'P0001', 'message_request_invalid_transition: accepted -> declined',
  'an answered request cannot be changed again');

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select is((select count(*)::int from public.message_requests_inbox), 0,
  'the inbox view shows only requests addressed to the caller');
reset role;

select hasnt_column('public', 'message_requests', 'body', 'message_requests has no body column');
select hasnt_column('public', 'message_requests_inbox', 'body', 'message_requests_inbox exposes no body');

select * from finish();
rollback;
