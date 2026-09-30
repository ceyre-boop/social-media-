-- User search (migration 20260930000020).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- alice 1111, bob 2222, minnie 3333, carol 4444, dave 5555 (seed.sql)
delete from public.blocks;
delete from ops.search_hits;
update public.profiles set display_name = 'Zelda Quill'
  where user_id = '33333333-3333-4333-8333-333333333333';  -- minnie

set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave

select results_eq($$select username from search_users('ali')$$,
  $$values ('alice'::text)$$, 'prefix finds alice');
select results_eq($$select username from search_users('  @ALI ')$$,
  $$values ('alice'::text)$$, 'query is trimmed, lowercased, @ stripped');
select results_eq($$select username from search_users('alcie')$$,
  $$values ('alice'::text)$$, 'typo finds alice by similarity');
select results_eq($$select username from search_users('zel')$$,
  $$values ('minnie'::text)$$, 'display-name prefix finds minnie');
select is((select count(*)::int from search_users('dav')), 0, 'self is hidden');
select is((select count(*)::int from search_users('')), 0, 'empty query returns nothing');

reset role;
select is(
  (select array_agg(col order by col) from unnest(
    (select proargnames from pg_proc where oid = 'public.search_users'::regproc)) col
   where col ~* 'count'),
  null, 'return shape has no count columns');

-- blocks, both directions
insert into public.blocks (blocker_id, blocked_id)
  values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111');
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from search_users('ali')), 0, 'blocked by me: hidden');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from search_users('dav')), 0, 'blocked me: hidden');

-- banned / deleted
reset role;
delete from public.blocks;
update public.users set status = 'banned' where id = '22222222-2222-4222-8222-222222222222';
update public.users set deleted_at = now() where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from search_users('bob')) +
          (select count(*)::int from search_users('carol')), 0, 'banned and deleted hidden');

-- anon denied
reset role;
set local role anon;
select throws_ok($$select * from search_users('ali')$$, '42501', null, 'anon cannot search');

-- rate limit
reset role;
delete from ops.search_hits;
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select lives_ok($$select count(*) from (select search_users('a') from generate_series(1, 29)) s$$, '29 searches ok');
select throws_ok($$select * from search_users('a') union all select * from search_users('a')$$,
  'P0001', 'search_rate_limited', 'over 30 per minute raises search_rate_limited');

select * from finish();
rollback;
