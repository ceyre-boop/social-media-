-- RLS: profiles, post visibility by relationship, likes → interactions,
-- interactions/relationships privacy, blocks, anon.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
-- Visible post ids for the current role/claims, among alice's four
-- visibility-matrix posts.
create function pg_temp.visible_matrix() returns text[] language sql as $$
  select coalesce(array_agg(visibility::text order by visibility), '{}')
  from public.posts
  where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
               'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004');
$$;

-- ---------------------------------------------------------------- profiles
set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob

select is(
  pg_temp.affected($$update public.profiles set bio = 'hacked by bob'
                      where user_id = '11111111-1111-4111-8111-111111111111'$$),
  0, 'bob cannot update alice''s profile (0 rows affected)');
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('55555555-5555-4555-8555-555555555555', 'fake_dave')$$,
  '42501', null, 'bob cannot insert a profile row for another user (dave)');
select lives_ok(
  $$update public.profiles set bio = 'Still shows up.' where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'bob can update his own profile content');
select throws_ok(
  $$update public.profiles set is_verified = true where user_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'bob cannot set his own is_verified badge');
select throws_ok(
  $$update public.profiles set post_count = 999 where user_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'bob cannot write his own post_count');
select throws_ok(
  $$update public.users set age_verified = true where id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'users cannot self-set age_verified');
select throws_ok(
  $$update public.users set date_of_birth = '1970-01-01' where id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'users cannot rewrite their own date_of_birth');
select throws_ok(
  $$update public.posts set like_count = 1000000 where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$,
  '42501', null, 'authors cannot write counter columns');

reset role;
select is((select bio from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'Makes things.', 'alice''s bio is unchanged after bob''s attempt');

-- A fresh auth user (no profile yet) may create only their own profile.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666',
        'authenticated', 'authenticated', 'erin@example.com', '{"date_of_birth":"1999-01-01"}');
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777777',
        'authenticated', 'authenticated', 'nodob@example.com', '{}');
select is((select date_of_birth from public.users where id = '66666666-6666-4666-8666-666666666666'),
  '1999-01-01'::date, 'signup trigger copies date_of_birth from metadata into users');
select is((select count(*)::int from public.users
           where id = '77777777-7777-4777-8777-777777777777' and date_of_birth is null),
  1, 'signup without date_of_birth still creates the users row with a null DOB');
select is((select count(*)::int from public.profiles
           where user_id in ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777')),
  0, 'signup trigger does not create a profile');

set local role authenticated;
select pg_temp.act_as('66666666-6666-4666-8666-666666666666');
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('77777777-7777-4777-8777-777777777777', 'squatter')$$,
  '42501', null, 'erin cannot create a profile for another user');
select lives_ok(
  $$insert into public.profiles (user_id, username, display_name) values ('66666666-6666-4666-8666-666666666666', 'erin', 'Erin')$$,
  'erin can create her own profile');

-- ------------------------------------------------------------ interactions
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
select throws_ok(
  $$insert into public.interactions (actor_id, subject_id, kind)
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'view')$$,
  '42501', null, 'a client cannot insert interactions, even as the actor');
select throws_ok(
  $$select count(*) from public.interactions$$,
  '42501', null, 'a client cannot read interactions');
select throws_ok(
  $$insert into public.relationships (actor_id, subject_id, state, first_seen_at, last_seen_at)
    values ('22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555', 'regular', now(), now())$$,
  '42501', null, 'a client cannot write relationships');

-- relationships: only the two parties see a row.
select is((select count(*)::int from public.relationships), 2,
  'bob sees exactly his two relationship rows (bob→alice, alice→bob)');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave
select is((select count(*)::int from public.relationships), 0,
  'dave sees no relationship rows (he is party to none)');

-- ------------------------------------------------------- post visibility
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave: no relationship
select is(pg_temp.visible_matrix(), array['public'],
  'dave (no relationship) reads alice''s public post only — not followers, friends or private');

select pg_temp.act_as('44444444-4444-4444-8444-444444444444');  -- carol: returning
select is(pg_temp.visible_matrix(), array['public','followers'],
  'carol (returning) reads public + followers, not friends or private');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob: mutual
select is(pg_temp.visible_matrix(), array['public','followers','friends'],
  'bob (mutual regular) reads public + followers + friends, not private');

select pg_temp.act_as('33333333-3333-4333-8333-333333333333');  -- minnie
select is(pg_temp.visible_matrix(), array['public'],
  'minnie (no relationship) reads the public post only');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
select is(pg_temp.visible_matrix(), array['public','followers','friends','private'],
  'alice reads all four of her own posts, private included');
select is((select count(*)::int from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000006'),
  1, 'alice still sees her own soft-deleted post');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000006'),
  0, 'others cannot see a soft-deleted post');

reset role;
set local role anon;
select pg_temp.act_as_anon();
select is(pg_temp.visible_matrix(), array['public'],
  'anon reads alice''s public post only — never private, followers or friends');
select is((select count(*)::int from public.profiles), 6, 'anon can read every profile (5 seeded + erin)');
select is((select count(*)::int from public.users), 0, 'anon cannot read users (DOB is private)');
select throws_ok($$select count(*) from public.interactions$$, '42501', null,
  'anon cannot read interactions');
reset role;

-- A viewer can only ask can_view_post about themself.
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave asks on bob's behalf
select is(public.can_view_post('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222'),
  false, 'can_view_post refuses to answer for a viewer other than the caller');

-- ----------------------------------------------------- likes → interactions
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob likes alice's public post
insert into public.likes (post_id, user_id)
values ('aaaaaaaa-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice likes her own post
insert into public.likes (post_id, user_id)
values ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave
select throws_ok(
  $$insert into public.likes (post_id, user_id)
    values ('aaaaaaaa-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555')$$,
  '42501', null, 'dave cannot like a friends-only post he cannot view');
select throws_ok(
  $$insert into public.likes (post_id, user_id)
    values ('aaaaaaaa-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'dave cannot like on bob''s behalf');
select throws_ok(
  $$insert into public.likes (post_id, user_id, created_at)
    values ('aaaaaaaa-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', now() - interval '1 year')$$,
  '42501', null, 'a client cannot backdate a like (created_at feeds interactions)');
reset role;

select is((select count(*)::int from public.interactions
           where post_id = 'aaaaaaaa-0000-4000-8000-000000000005' and kind = 'like'
             and actor_id = '22222222-2222-4222-8222-222222222222'
             and subject_id = '11111111-1111-4111-8111-111111111111'),
  1, 'bob''s like wrote exactly one like interaction (bob → alice, with the post id)');
select is((select count(*)::int from public.interactions
           where post_id = 'aaaaaaaa-0000-4000-8000-000000000005' and kind = 'like'),
  1, 'alice''s self-like wrote no interaction');
select is((select like_count from public.posts where id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  2::bigint, 'like_count counts both likes');

set local role authenticated;
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select lives_ok(
  $$delete from public.likes where post_id = 'aaaaaaaa-0000-4000-8000-000000000005'
      and user_id = '22222222-2222-4222-8222-222222222222'$$,
  'bob can remove his own like');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is(
  pg_temp.affected($$delete from public.likes where post_id = 'aaaaaaaa-0000-4000-8000-000000000005'$$),
  0, 'dave cannot delete someone else''s like');

-- ------------------------------------------------------------------ blocks
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
insert into public.blocks (blocker_id, blocked_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
select is(pg_temp.visible_matrix(), '{}'::text[],
  'after bob blocks alice he sees none of her posts, not even public or friends');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.posts where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  0, 'the blocked user (alice) cannot see the blocker''s public post');
select is((select count(*)::int from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  0, 'profiles are hidden across a block');
reset role;

-- ------------------------------------------------------- public_profiles
select hasnt_column('public', 'public_profiles', 'follower_count',  'public_profiles has no follower_count');
select hasnt_column('public', 'public_profiles', 'following_count', 'public_profiles has no following_count');
select hasnt_column('public', 'public_profiles', 'post_count',      'public_profiles exposes no post_count');

select * from finish();
rollback;
