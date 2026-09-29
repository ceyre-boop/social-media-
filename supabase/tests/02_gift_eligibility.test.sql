-- Gift recipients must be verified adults with enabled payouts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select throws_like(
  $$insert into public.gift_events
      (sender_id, recipient_id, gift_id, quantity, coins_total, post_id, terms_id,
       gross_cents, app_store_fee_cents, platform_fee_cents, creator_net_cents)
    values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
       (select id from public.gift_catalog order by id limit 1), 1, 10,
       'aaaaaaaa-0000-4000-8000-000000000001',
       (select id from public.creator_terms where user_id is null and version = 1),
       100, 30, 10, 60)$$,
  'gift_recipient_not_verified_adult',
  'gifting an unverified adult recipient raises gift_recipient_not_verified_adult');
select throws_like(
  $$insert into public.gift_events
      (sender_id, recipient_id, gift_id, quantity, coins_total, post_id, terms_id,
       gross_cents, app_store_fee_cents, platform_fee_cents, creator_net_cents)
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
       (select id from public.gift_catalog order by id limit 1), 1, 10,
       'aaaaaaaa-0000-4000-8000-000000000001',
       (select id from public.creator_terms where user_id is null and version = 1),
       100, 30, 10, 60)$$,
  'gift_recipient_payouts_not_enabled',
  'gifting a verified adult without enabled payouts raises gift_recipient_payouts_not_enabled');
insert into public.payout_accounts (user_id, payouts_enabled)
values ('11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$insert into public.gift_events
      (sender_id, recipient_id, gift_id, quantity, coins_total, post_id, terms_id,
       gross_cents, app_store_fee_cents, platform_fee_cents, creator_net_cents)
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
       (select id from public.gift_catalog order by id limit 1), 1, 10,
       'aaaaaaaa-0000-4000-8000-000000000001',
       (select id from public.creator_terms where user_id is null and version = 1),
       100, 30, 10, 60)$$,
  'an enabled-payout verified adult passes the gift recipient guard without a ledger transaction');

select * from finish();
rollback;
