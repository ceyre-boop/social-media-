-- Child safety and DM rules (brief §7, as amended by migration 010): helper
-- privacy, can_dm, message and member-join gating, live gating, message
-- requests. 11_dm_rules covers the 010 direction table and opacity in full.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

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
  false, 'alice ↔ dave, verified adults but not connected: no DIRECT thread (010: a message request instead)');

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
select set_config('request.jwt.claims', '', true);  -- service path: no JWT
delete from public.blocks;

-- ------------------------------------------ messages: minor ↔ adult (C2)
-- An ADULT-initiated thread (dave's). 010: in a thread a minor started, the
-- adult may keep replying; here he may not once the connection lapses.
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555');
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'member_join_not_allowed', 'minnie cannot even be added to a conversation with dave');

-- Build the conversation while they are mutual, then remove the relationship:
-- the send-time check must still stop both directions.
insert into public.relationships (actor_id, subject_id, state, distinct_weeks, interaction_count,
                                  first_seen_at, last_seen_at) values
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'regular', 4, 4, now(), now()),
  ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', 'regular', 4, 4, now(), now());
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'hi (mutual)')$$,
  'minnie → dave succeeds while they are mutual regulars');
reset role;
delete from public.relationships
where (actor_id, subject_id) in (('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333'),
                                 ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555'));

set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'hi dave')$$,
  '010: a minor may still write to an adult already in the thread (minor → anyone)');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'hi minnie')$$,
  'P0001', 'dm_not_allowed', 'an adult (dave) cannot message minnie in his own thread once they are no longer connected');

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
  'P0001', 'request_not_allowed', 'an adult cannot send a message request to a minor');
reset role;
insert into public.blocks (blocker_id, blocked_id)
values ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555');
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id)
    values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111')$$,
  'P0001', 'request_not_allowed',
  'a request to an adult who blocked dave fails with the SAME error as to a minor (no age oracle)');
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id)
    values ('55555555-5555-4555-8555-555555555555', '99999999-9999-4999-8999-999999999999')$$,
  'P0001', 'request_not_allowed',
  'a request to a nonexistent user fails with the SAME error (no existence oracle)');
reset role;
delete from public.blocks;
set local role authenticated;

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
select is((select count(*)::int from public.message_requests_inbox
           where id = 'd0000000-0000-4000-8000-000000000001'), 0,
  'the inbox view shows only requests addressed to the caller');

-- -------------------------------------------- leave-then-add (review HIGH 1)
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave
insert into public.conversations (id, created_by)
values ('c0000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555');
insert into public.conversation_members (conversation_id, user_id)
values ('c0000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555');
insert into public.messages (id, conversation_id, sender_id, body)
values ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005',
        '55555555-5555-4555-8555-555555555555', 'hi kid');
update public.conversation_members set left_at = now()
where conversation_id = 'c0000000-0000-4000-8000-000000000005' and user_id = '55555555-5555-4555-8555-555555555555';
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'member_join_not_allowed',
  'dave cannot add minnie after writing and leaving (adder must be an active member)');
select is(
  pg_temp.affected($$update public.messages set body = 'edited after leaving'
                      where id = 'e0000000-0000-4000-8000-000000000001'$$),
  0, 'a sender who left cannot edit their message');
select throws_ok(
  $$update public.conversation_members set conversation_id = 'c0000000-0000-4000-8000-000000000001'
    where conversation_id = 'c0000000-0000-4000-8000-000000000005'
      and user_id = '55555555-5555-4555-8555-555555555555'$$,
  '42501', null, 'a member cannot move their membership row into another conversation');
select throws_ok(
  $$update public.conversations set created_by = '55555555-5555-4555-8555-555555555555'
    where id = 'c0000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'conversations.created_by cannot be rewritten by a client');
reset role;
select set_config('request.jwt.claims', '', true);  -- service path: no JWT
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c0000000-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333')$$,
  'P0001', 'member_join_not_allowed',
  'even the service path cannot add minnie: a past (left) member/sender she cannot DM is checked');
select is((select body from public.messages where id = 'e0000000-0000-4000-8000-000000000001'),
  'hi kid', 'the message body is unchanged');

-- ------------------------------------------------ helper oracles (review 4)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select private.blocked_between('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555')$$,
  '42501', null, 'anon cannot call the internal block check for arbitrary users');
reset role;
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$select private.member_of('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'dave cannot call the internal membership check for other users');
select throws_ok(
  $$select public.is_blocked_between('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')$$,
  '42883', null, 'the old public block-check RPC no longer exists');
select is(private.blocked_with_me('11111111-1111-4111-8111-111111111111'), false,
  'the policy helper answers only about the caller (dave is not blocked with alice)');

-- ----------------------------------------- friendships / appeals (review 8)
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
-- (migration 014 replaced the v0.1 table; 14_friendships covers it in full)
select public.request_friend('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$select public.respond_friend('55555555-5555-4555-8555-555555555555', true)$$,
  'P0001', 'request_not_allowed', 'the requester cannot accept their own friend request');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave, addressee
select is(public.respond_friend('22222222-2222-4222-8222-222222222222', true),
  'friends', 'the addressee can accept');
select throws_ok(
  $$insert into public.appeals (decision_id, user_id, statement, outcome)
    values (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', 'x', 'granted')$$,
  '42501', null, 'a client cannot set an appeal outcome');

-- ---------------------------------------------------- live (review 7)
select throws_ok($$select ingest_url from public.live_streams limit 1$$, '42501', null,
  'authenticated cannot read live_streams.ingest_url (stream key)');
reset role;
insert into public.live_streams (id, host_id, provider, is_adult_only)
values ('f1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'test', true);
set local role authenticated;
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$insert into public.live_participants (stream_id, user_id)
    values ('f1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'minnie cannot join an adult-only stream');
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select lives_ok(
  $$insert into public.live_participants (stream_id, user_id)
    values ('f1000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444')$$,
  'carol (adult) can join an adult-only stream');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select ingest_url from public.live_streams limit 1$$, '42501', null,
  'anon cannot read live_streams.ingest_url');
reset role;

select hasnt_column('public', 'message_requests', 'body', 'message_requests has no body column');
select hasnt_column('public', 'message_requests_inbox', 'body', 'message_requests_inbox exposes no body');

select * from finish();
rollback;
