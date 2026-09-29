-- Creator terms are versioned and immutable; one active row per user.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.creator_terms (id, user_id, version, creator_share_bps, effective_from, summary)
values ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        1, 8000, now(), 'Alice custom v1');

select throws_ok(
  $$insert into public.creator_terms (user_id, version, creator_share_bps, effective_from, summary)
    values ('11111111-1111-4111-8111-111111111111', 2, 8500, now(), 'Alice custom v2')$$,
  '23505', null, 'a second active terms row for the same user raises');
select throws_ok(
  $$insert into public.creator_terms (user_id, version, creator_share_bps, effective_from, summary)
    values (null, 2, 6000, now(), 'second active default')$$,
  '23505', null, 'a second active default (null user) row raises (nulls not distinct)');
select throws_ok(
  $$insert into public.creator_terms (user_id, version, creator_share_bps, effective_from, superseded_at, summary)
    values (null, 1, 6000, now(), now(), 'duplicate default version')$$,
  '23505', null, 'duplicate (null user, version) raises (nulls not distinct)');

select throws_like(
  $$update public.creator_terms set creator_share_bps = 9000
    where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'creator_terms is immutable%', 'updating creator_share_bps raises');
select throws_like(
  $$update public.creator_terms set superseded_at = now(), creator_share_bps = 9000
    where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'creator_terms is immutable%', 'superseding while changing another column raises');

select lives_ok(
  $$update public.creator_terms set superseded_at = now()
    where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'setting superseded_at once works');
select throws_like(
  $$update public.creator_terms set superseded_at = now() + interval '1 day'
    where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'creator_terms is immutable%', 'setting superseded_at a second time raises');
select throws_like(
  $$delete from public.creator_terms where id = 'dddddddd-0000-4000-8000-000000000001'$$,
  'creator_terms is append-only%', 'deleting terms raises');

select * from finish();
rollback;
