-- purchase_coins → send_gift: split math, terms snapshot, balances, gating.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- carol: adult, NOT age-verified (valid sender, ineligible recipient).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
        'authenticated', 'authenticated', 'carol@example.com',
        '{"username":"carol","date_of_birth":"1988-01-01"}');
insert into public.posts (id, author_id, kind, caption)
values ('cccccccc-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'post', 'carol post');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- bob buys 1000 coins
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select lives_ok(
  $$select public.purchase_coins((select id from public.coin_products where sku = 'coins_1000'),
                                 'dev', 'test-txn-bob-1')$$,
  'bob purchases 1000 coins');
select is(
  (select b.balance::int from public.ledger_balances b
   join public.ledger_accounts a on a.id = b.account_id
   where a.owner_id = '22222222-2222-4222-8222-222222222222' and a.kind = 'user_coins'),
  1000, 'bob user_coins balance is 1000 after purchase');
select is((select count(*)::int from public.coin_purchases), 1, 'bob sees his one purchase');

-- bob gifts 3 x Star (100 coins) on alice's post → 300 coins, 300 cents gross
create temp table g as
select * from public.send_gift(
  '11111111-1111-4111-8111-111111111111',
  (select id from public.gift_catalog where name = 'Star'),
  3,
  'aaaaaaaa-0000-4000-8000-000000000001');

select is((select coins_total from g), 300, 'coins_total = coins x qty');
select is((select gross_cents from g), 300, 'gross = coins_total x coin_value_cents() (1 coin = 1 cent)');
select is((select app_store_fee_cents from g), 90, 'app store fee = floor(30% of gross)');
select is((select creator_net_cents from g), 147, 'creator net = floor((gross - app_store) x 7000 / 10000)');
select is((select platform_fee_cents from g), 63, 'platform = remainder');
select ok((select gross_cents = app_store_fee_cents + platform_fee_cents + creator_net_cents from g),
  'gross = app_store + platform + creator_net');
select is((select terms_id from g),
  (select id from public.creator_terms where user_id is null and superseded_at is null),
  'terms_id snapshots the default creator terms');
select isnt((select ledger_transaction_id from g), null, 'gift is linked to its ledger transaction');
select is(
  (select b.balance::int from public.ledger_balances b
   join public.ledger_accounts a on a.id = b.account_id
   where a.owner_id = '22222222-2222-4222-8222-222222222222' and a.kind = 'user_coins'),
  700, 'bob balance decreased by coins_total');
select lives_ok('set constraints all immediate', 'gift ledger transaction balances at commit');
set constraints all deferred;

-- alice (recipient) sees the gift and her creator_earnings credit
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.gift_events), 1, 'recipient can see the gift event');
select is(
  (select b.balance::int from public.ledger_balances b
   join public.ledger_accounts a on a.id = b.account_id
   where a.owner_id = '11111111-1111-4111-8111-111111111111' and a.kind = 'creator_earnings'),
  300, 'alice creator_earnings credited coins_total');

-- Failure paths
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$select public.send_gift('11111111-1111-4111-8111-111111111111',
      (select id from public.gift_catalog where name = 'Crown'), 10,
      'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'insufficient_balance', 'gift above balance raises insufficient_balance');
select throws_ok(
  $$select public.send_gift('44444444-4444-4444-8444-444444444444',
      (select id from public.gift_catalog where name = 'Rose'), 1,
      'cccccccc-0000-4000-8000-000000000001')$$,
  'P0001', 'recipient_not_eligible', 'unverified recipient raises');
select throws_ok(
  $$select public.send_gift('11111111-1111-4111-8111-111111111111',
      (select id from public.gift_catalog where name = 'Rose'), 1, null, null)$$,
  'P0001', 'exactly_one_context_required', 'gift without a context raises');

select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok(
  $$select public.send_gift('11111111-1111-4111-8111-111111111111',
      (select id from public.gift_catalog where name = 'Rose'), 1,
      'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'sender_not_adult', 'minor sender raises');

-- anon cannot move money at all
reset role;
set local role anon;
select throws_ok(
  $$select public.purchase_coins((select id from public.coin_products limit 1), 'dev', 'anon')$$,
  '42501', null, 'anon cannot call purchase_coins');
reset role;

select * from finish();
rollback;
