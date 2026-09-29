-- RLS: private data stays private; blocks hide content both ways.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Fixtures (as postgres): alice has ledger activity and a private conversation.
insert into public.conversations (id, created_by)
values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
insert into public.conversation_members (conversation_id, user_id)
values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
insert into public.messages (conversation_id, sender_id, body)
values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'note to self');
insert into public.posts (id, author_id, kind, caption)
values ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'post', 'bob public post');

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select public.purchase_coins((select id from public.coin_products where sku = 'coins_500'), 'dev', 'rls-alice');

-- alice: positive controls
select is((select count(*)::int from public.reach_events), 1, 'alice sees her own reach_events');
select ok((select count(*) from public.ledger_entries) > 0, 'alice sees her own ledger entries');
select is((select count(*)::int from public.messages), 1, 'alice sees messages in her conversation');
select is((select count(*)::int from public.users), 1, 'alice sees exactly her own users row');

-- bob: cannot see alice's private data
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.reach_events
           where post_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0, 'bob cannot select alice''s reach_events');
select is((select count(*)::int from public.ledger_entries), 0, 'bob cannot select alice''s ledger entries');
select is((select count(*)::int from public.ledger_accounts), 0, 'bob cannot select alice''s ledger accounts');
select is((select count(*)::int from public.messages
           where conversation_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  0, 'bob cannot select messages in a conversation he is not in');
select is((select count(*)::int from public.users where id = '11111111-1111-4111-8111-111111111111'),
  0, 'bob cannot read alice''s users row (DOB is private)');
select is((select count(*)::int from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1, 'before a block, bob sees alice''s public post');
select throws_ok(
  $$update public.users set age_verified = true where id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'users cannot self-set age_verified');
select throws_ok(
  $$update public.posts set like_count = 1000000 where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$,
  '42501', null, 'authors cannot write counter columns');

-- bob blocks alice → neither sees the other's public posts or profile
insert into public.blocks (blocker_id, blocked_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0, 'blocker cannot see the blocked user''s public post');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.posts where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  0, 'blocked user cannot see the blocker''s public post');
select is((select count(*)::int from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  0, 'profiles are hidden across a block');

-- anon sees public posts, never reach data
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1, 'anon sees a public post');
reset role;

select * from finish();
rollback;
