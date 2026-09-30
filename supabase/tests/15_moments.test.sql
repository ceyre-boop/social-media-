-- Migrations 015/016: Moments are friends-only through RLS whatever their
-- visibility; never anon, never Discover/public paths; media and child rows
-- follow the same rule.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.u(name text) returns uuid language sql immutable as $$
  select case name
    when 'alice'  then '11111111-1111-4111-8111-111111111111'
    when 'bob'    then '22222222-2222-4222-8222-222222222222'
    when 'minnie' then '33333333-3333-4333-8333-333333333333'
    when 'carol'  then '44444444-4444-4444-8444-444444444444'
    when 'dave'   then '55555555-5555-4555-8555-555555555555'
  end::uuid;
$$;

create function pg_temp.try(stmt text) returns text language plpgsql as $f$
declare out text;
begin
  execute stmt into out;
  return 'ok:' || coalesce(out, '');
exception when others then
  return sqlstate || ':' || sqlerrm;
end $f$;

-- Runs `stmt` as `name` ('anon' for signed out) and returns its single value.
create function pg_temp.as_user(name text, stmt text) returns text language plpgsql as $f$
declare out text;
begin
  if name = 'anon' then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', pg_temp.u(name), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
  out := pg_temp.try(stmt);
  execute 'reset role';
  return out;
end $f$;

create function pg_temp.sees(name text) returns text language sql as $$
  select replace(pg_temp.as_user(name, $q$select count(*)::text from public.posts where id = 'cccccccc-0000-4000-8000-000000000001'$q$), 'ok:', '');
$$;

-- alice and bob are friends (and, from seed, also behaviour-mutual regulars).
insert into public.friendships (user_a_id, user_b_id, state, requested_by, accepted_at)
values (pg_temp.u('alice'), pg_temp.u('bob'), 'accepted', pg_temp.u('alice'), now());

insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, width, height)
values ('cccccccc-1111-4000-8000-000000000001', pg_temp.u('alice'), 'image', 'ready', 'supabase',
        '11111111-1111-4111-8111-111111111111/moment-1.jpg', 1080, 1440);

-- alice writes a moment and tries to make it public.
select is(pg_temp.as_user('alice', $$insert into public.posts (id, author_id, kind, caption, visibility, camera_effect)
  values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'moment', 'Soup', 'public', 'warm')
  returning visibility::text$$), 'ok:private', 'a moment is stored as private whatever visibility is asked for');
select is(pg_temp.as_user('alice', $$insert into public.post_media (post_id, media_id)
  values ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-1111-4000-8000-000000000001') returning 'x'$$),
  'ok:x', 'the author attaches the photo');
select is((select capture_mode from public.posts where id = 'cccccccc-0000-4000-8000-000000000001'), 'single',
          'capture_mode defaults to single');

-- ------------------------------------------------------------------ who sees it
select is(pg_temp.sees('alice'),  '1', 'the author sees her moment');
select is(pg_temp.sees('bob'),    '1', 'a friend sees it');
select is(pg_temp.sees('dave'),   '0', 'a non-friend does not');
select is(pg_temp.sees('carol'),  '0', 'someone who returns to alice (followers rule) does not');
select is(pg_temp.sees('minnie'), '0', 'a stranger minor does not');
select is(pg_temp.sees('anon'),   '0', 'signed out never does');

select is(pg_temp.as_user('bob', $$select count(*)::text from public.post_media where post_id = 'cccccccc-0000-4000-8000-000000000001'$$),
          'ok:1', 'the friend can read the media link');
select is(pg_temp.as_user('dave', $$select count(*)::text from public.post_media where post_id = 'cccccccc-0000-4000-8000-000000000001'$$),
          'ok:0', 'a non-friend cannot');
select is(pg_temp.as_user('bob', $$select count(*)::text from public.media_assets where id = 'cccccccc-1111-4000-8000-000000000001'$$),
          'ok:1', 'the friend can read the media row (so the photo can be signed)');
select is(pg_temp.as_user('dave', $$select count(*)::text from public.media_assets where id = 'cccccccc-1111-4000-8000-000000000001'$$),
          'ok:0', 'a non-friend cannot read the media row');
select is(pg_temp.as_user('bob',  $$select private.media_object_visible('11111111-1111-4111-8111-111111111111/moment-1.jpg')::text$$),
          'ok:true',  'the friend may read the stored file');
select is(pg_temp.as_user('dave', $$select private.media_object_visible('11111111-1111-4111-8111-111111111111/moment-1.jpg')::text$$),
          'ok:false', 'a non-friend may not read the stored file');
select is(pg_temp.as_user('anon', $$select private.media_object_visible('11111111-1111-4111-8111-111111111111/moment-1.jpg')::text$$),
          'ok:false', 'nor may anon');
select is(pg_temp.as_user('bob',  $$select public.can_view_post('cccccccc-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222')::text$$),
          'ok:true', 'can_view_post agrees for the friend');
select is(pg_temp.as_user('dave', $$select public.can_view_post('cccccccc-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555')::text$$),
          'ok:false', 'and for the non-friend');
select is(pg_temp.as_user('bob', $$insert into public.likes (post_id, user_id) values ('cccccccc-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222') returning 'x'$$),
          'ok:x', 'a friend can like it');
select alike(pg_temp.as_user('dave', $$insert into public.likes (post_id, user_id) values ('cccccccc-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555') returning 'x'$$),
          '42501:%', 'a non-friend cannot');

-- ------------------------------------------------------------------ public paths
select is(pg_temp.as_user('bob', $$select count(*)::text from public.posts where visibility = 'public' and kind = 'moment'$$),
          'ok:0', 'Discover''s public-only filter can never match a moment, even for a friend');
select is(pg_temp.as_user('anon', $$select count(*)::text from public.posts where author_id = '11111111-1111-4111-8111-111111111111' and kind = 'moment'$$),
          'ok:0', 'a public profile grid (anon) never includes moments');

select is(pg_temp.as_user('alice', $$update public.posts set visibility = 'public' where id = 'cccccccc-0000-4000-8000-000000000001' returning visibility::text$$),
          'ok:private', 'updating visibility cannot make a moment public');
select is(pg_temp.sees('dave'), '0', 'and the non-friend still cannot see it');
select is(pg_temp.as_user('alice', $$update public.posts set visibility = 'friends' where id = 'cccccccc-0000-4000-8000-000000000001' returning visibility::text$$),
          'ok:private', 'nor switch it to the behaviour-derived friends visibility');

-- ------------------------------------------------------------------ shape rules
select throws_ok($$update public.posts set kind = 'post' where id = 'cccccccc-0000-4000-8000-000000000001'$$,
                 '23514', 'moment_kind_immutable', 'a moment cannot be re-kinded (even by the service role)');
select throws_ok($$insert into public.posts (author_id, kind, camera_effect) values ('11111111-1111-4111-8111-111111111111', 'post', 'warm')$$,
                 '23514', null, 'camera_effect only on moments');
insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, duration_ms)
values ('cccccccc-1111-4000-8000-000000000002', pg_temp.u('alice'), 'video', 'ready', 'supabase',
        '11111111-1111-4111-8111-111111111111/v.mp4', 5000);
select throws_ok($$insert into public.post_media (post_id, media_id) values ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-1111-4000-8000-000000000002')$$,
                 '23514', 'post_requires_image', 'a moment attaches only a photo');

-- ------------------------------------------------------------------ friendship ends
delete from public.friendships where user_a_id = pg_temp.u('alice') and user_b_id = pg_temp.u('bob');
select is(public.is_mutual(pg_temp.u('alice'), pg_temp.u('bob')), true, '(bob is still a behaviour-mutual regular of alice)');
select is(pg_temp.sees('bob'), '0', 'unfriended: bob no longer sees it; behaviour-derived closeness never counts');

insert into public.friendships (user_a_id, user_b_id, state, requested_by, accepted_at)
values (pg_temp.u('alice'), pg_temp.u('bob'), 'accepted', pg_temp.u('alice'), now());
select is(pg_temp.sees('bob'), '1', 'friends again: visible again');
update public.posts set deleted_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select is(pg_temp.sees('bob'), '0', 'a deleted moment is gone for friends');
select is(pg_temp.sees('alice'), '1', 'the author still has it');
update public.posts set deleted_at = null where id = 'cccccccc-0000-4000-8000-000000000001';
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('bob'), pg_temp.u('alice'));
select is(pg_temp.sees('bob'), '0', 'a block ends it');

select * from finish();
rollback;
