-- Ledger guarantees: append-only (raises, never silently ignored) and
-- double-entry balance enforced at commit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixture: one balanced COIN transaction on system accounts.
create temp table fx as
select public.ensure_ledger_account(null, 'coin_issuance',    'COIN') as issuance,
       public.ensure_ledger_account(null, 'platform_revenue', 'COIN') as revenue,
       gen_random_uuid() as txn;
insert into public.ledger_transactions (id, kind) select txn, 'test' from fx;
insert into public.ledger_entries (transaction_id, account_id, side, amount, currency)
select txn, issuance, 'debit'::public.ledger_side,  100, 'COIN' from fx union all
select txn, revenue,  'credit'::public.ledger_side, 100, 'COIN' from fx;

select lives_ok('set constraints all immediate', 'balanced transaction passes the commit-time check');
set constraints all deferred;

-- Append-only: ledger_entries
select throws_ok('update public.ledger_entries set amount = 1',
  'P0001', 'ledger_entries is append-only: UPDATE is not permitted', 'ledger_entries UPDATE raises');
select throws_ok('delete from public.ledger_entries',
  'P0001', 'ledger_entries is append-only: DELETE is not permitted', 'ledger_entries DELETE raises');
select throws_ok('truncate public.ledger_entries',
  'P0001', 'ledger_entries is append-only: TRUNCATE is not permitted', 'ledger_entries TRUNCATE raises');

-- Append-only: the other money tables
select throws_like('update public.ledger_transactions set memo = ''x''',
  '%append-only%', 'ledger_transactions UPDATE raises');
select throws_like('delete from public.ledger_transactions',
  '%append-only%', 'ledger_transactions DELETE raises');
select throws_like('truncate public.coin_purchases cascade',
  '%append-only%', 'coin_purchases TRUNCATE raises');
select throws_like('truncate public.gift_events',
  '%append-only%', 'gift_events TRUNCATE raises');

select is((select sum(amount)::int from public.ledger_entries e join fx on e.transaction_id = fx.txn),
  200, 'rows are intact after the rejected mutations');

-- Commit-time balance check. The helper posts a one-sided entry and forces
-- the deferred constraint trigger to fire now instead of at COMMIT.
create function pg_temp.post_unbalanced() returns void language plpgsql as $$
declare
  t uuid := gen_random_uuid();
begin
  insert into public.ledger_transactions (id, kind) values (t, 'test_unbalanced');
  insert into public.ledger_entries (transaction_id, account_id, side, amount, currency)
  values (t, public.ensure_ledger_account(null, 'coin_issuance', 'COIN'), 'debit', 50, 'COIN');
  set constraints all immediate;
end $$;
select throws_like('select pg_temp.post_unbalanced()',
  'ledger_unbalanced:%', 'unbalanced transaction raises at commit');
set constraints all deferred;

create function pg_temp.post_currency_mismatch() returns void language plpgsql as $$
declare
  t uuid := gen_random_uuid();
begin
  insert into public.ledger_transactions (id, kind) values (t, 'test_mismatch');
  insert into public.ledger_entries (transaction_id, account_id, side, amount, currency) values
    (t, public.ensure_ledger_account(null, 'coin_issuance',    'COIN'), 'debit',  50, 'USD'),
    (t, public.ensure_ledger_account(null, 'platform_revenue', 'COIN'), 'credit', 50, 'USD');
  set constraints all immediate;
end $$;
select throws_like('select pg_temp.post_currency_mismatch()',
  'ledger_currency_mismatch:%', 'entry currency must equal the account currency');
set constraints all deferred;

-- Clients cannot write money directly, even for their own account.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.ledger_transactions (kind) values ('forged')$$,
  '42501', null, 'authenticated cannot insert ledger_transactions');
select throws_ok(
  $$insert into public.coin_purchases (user_id, product_id, coins, gross_cents, processor)
    select '22222222-2222-4222-8222-222222222222', id, 999999, 0, 'forged' from public.coin_products limit 1$$,
  '42501', null, 'authenticated cannot insert coin_purchases');
select throws_ok(
  $$select public.ensure_ledger_account('22222222-2222-4222-8222-222222222222', 'user_coins', 'COIN')$$,
  '42501', null, 'authenticated cannot call ensure_ledger_account');
reset role;

select * from finish();
rollback;
