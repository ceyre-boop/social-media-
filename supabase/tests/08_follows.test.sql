-- Follows (migration 005): follow/unfollow as yourself, rows visible only to
-- the two parties, never to anon, no follow across a block, block severs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- alice 1111…, bob 2222…, carol 4444…, dave 5555… (seed.sql)

-- Start from no follows so dev data (e.g. scripts/seed-reels.ts adds
-- alice→carol and dave→bob) cannot change the counts below. Rolled back.
delete from public.follows;

set local role authenticated;

select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave
select lives_ok(
  $$insert into follows (follower_id, followee_id)
    values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111')$$,
  'dave can follow alice'
);
select throws_ok(
  $$insert into follows (follower_id, followee_id)
    values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null,
  'dave cannot create a follow on carol''s behalf'
);
select throws_ok(
  $$insert into follows (follower_id, followee_id)
    values ('55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555')$$,
  '23514', null,
  'nobody can follow themselves'
);
select is((select count(*)::int from follows where follower_id = '55555555-5555-4555-8555-555555555555'),
  1, 'dave sees his own follow');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
select is((select count(*)::int from follows where followee_id = '11111111-1111-4111-8111-111111111111'
                                             and follower_id = '55555555-5555-4555-8555-555555555555'),
  1, 'alice (the creator) sees that dave follows her');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
select is((select count(*)::int from follows where followee_id = '11111111-1111-4111-8111-111111111111'),
  0, 'bob cannot see or count alice''s followers');

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');  -- carol
delete from follows where follower_id = '55555555-5555-4555-8555-555555555555';
reset role;
select is((select count(*)::int from follows
            where follower_id = '55555555-5555-4555-8555-555555555555'
              and followee_id = '11111111-1111-4111-8111-111111111111'),
  1, 'carol cannot remove dave''s follow');
set local role authenticated;

reset role;
set local role anon;
select throws_ok($$select count(*) from follows$$, '42501', null, 'anon cannot read follows at all');
reset role;

-- Block: bob blocks dave, after dave follows bob. The follow is severed and
-- dave can't re-follow.
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
insert into follows (follower_id, followee_id)
  values ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222');
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
insert into blocks (blocker_id, blocked_id)
  values ('22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555');
reset role;
select is((select count(*)::int from follows
            where follower_id = '55555555-5555-4555-8555-555555555555'
              and followee_id = '22222222-2222-4222-8222-222222222222'),
  0, 'blocking removes the blocked user''s follow');

set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into follows (follower_id, followee_id)
    values ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null,
  'a blocked user cannot re-follow'
);

select lives_ok(
  $$delete from follows where follower_id = '55555555-5555-4555-8555-555555555555'
                          and followee_id = '11111111-1111-4111-8111-111111111111'$$,
  'dave can unfollow alice'
);
reset role;

-- 006: 'followers' posts are visible to followers as well as returners.
-- dave has no relationship with alice; aaaaaaaa-…-0002 is her followers-only post.
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from posts where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0, 'before following, dave cannot see alice''s followers-only post');
insert into follows (follower_id, followee_id)
  values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from posts where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  1, 'after following, dave can see alice''s followers-only post');
select is((select count(*)::int from posts where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  0, 'following does not unlock alice''s friends-only post');
reset role;

select * from finish();
rollback;
