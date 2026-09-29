-- The vertical slice's client paths (brief §8): upload → media_assets → post →
-- post_media, INSERT … RETURNING (supabase-js `.insert().select()`), and who
-- can read media rows and storage objects.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
-- Paths used below.
--   alice/private.jpg → attached to a PRIVATE post
--   alice/friends.jpg → attached to a FRIENDS post
--   alice/public.jpg  → attached to a PUBLIC post

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice

-- ------------------------------------------------------------- uploads
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
      ('media', '11111111-1111-4111-8111-111111111111/private.jpg', '11111111-1111-4111-8111-111111111111'),
      ('media', '11111111-1111-4111-8111-111111111111/friends.jpg', '11111111-1111-4111-8111-111111111111'),
      ('media', '11111111-1111-4111-8111-111111111111/public.jpg',  '11111111-1111-4111-8111-111111111111')$$,
  'alice can upload into her own folder of the media bucket');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('media', '22222222-2222-4222-8222-222222222222/photo.jpg', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'alice cannot upload into bob''s folder');

-- ------------------------------------------- INSERT … RETURNING as author
select lives_ok(
  $$insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, width, height)
    values ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
            'image', 'ready', 'supabase', '11111111-1111-4111-8111-111111111111/private.jpg', 1080, 1350),
           ('f0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
            'image', 'ready', 'supabase', '11111111-1111-4111-8111-111111111111/friends.jpg', 1080, 1350),
           ('f0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
            'image', 'ready', 'supabase', '11111111-1111-4111-8111-111111111111/public.jpg', 1080, 1350)
    returning id$$,
  'alice can insert media_assets … RETURNING (the app''s .insert().select())');
select lives_ok(
  $$insert into public.posts (id, author_id, kind, caption, visibility) values
      ('f0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'post', 'p', 'private'),
      ('f0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'post', 'f', 'friends'),
      ('f0000000-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 'post', 'u', 'public')
    returning id$$,
  'alice can insert posts … RETURNING, including a private post');
select lives_ok(
  $$insert into public.post_media (post_id, media_id, position) values
      ('f0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000001', 0),
      ('f0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000002', 0),
      ('f0000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000003', 0)
    returning post_id$$,
  'alice can attach her media to her posts … RETURNING');
select lives_ok(
  $$insert into public.likes (post_id, user_id)
    values ('f0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111')
    returning post_id$$,
  'alice can like her own private post … RETURNING');
select lives_ok(
  $$update public.profiles set bio = 'Makes more things.'
    where user_id = '11111111-1111-4111-8111-111111111111' returning user_id$$,
  'alice can update her profile … RETURNING');

-- ------------------------------------------------- media write guards
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, provider, provider_asset_id)
    values ('22222222-2222-4222-8222-222222222222', 'image', 'supabase', '22222222-2222-4222-8222-222222222222/x.jpg')$$,
  '42501', null, 'alice cannot register media owned by bob');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, provider, provider_asset_id, playback_url)
    values ('11111111-1111-4111-8111-111111111111', 'image', 'supabase',
            '11111111-1111-4111-8111-111111111111/x.jpg', 'https://evil.example/pixel.gif')$$,
  '42501', null, 'clients cannot set playback_url (no arbitrary URLs fetched by viewers)');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, provider, provider_asset_id)
    values ('11111111-1111-4111-8111-111111111111', 'image', 'supabase', 'someone-else/x.jpg')$$,
  '42501', null, 'provider_asset_id must be inside the caller''s own folder');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, provider)
    values ('11111111-1111-4111-8111-111111111111', 'image', 'supabase')$$,
  '42501', null, 'provider_asset_id is required');
select lives_ok(
  $$update public.posts set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$,
  'alice can soft-delete her own post');
select throws_ok(
  $$insert into public.posts (author_id, kind, caption)
    values ('22222222-2222-4222-8222-222222222222', 'post', 'forged')$$,
  '42501', null, 'alice cannot create a post as bob');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
select throws_ok(
  $$insert into public.posts (id, author_id, kind) values
      ('f0000000-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222', 'post');
    insert into public.post_media (post_id, media_id)
    values ('f0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'bob cannot attach alice''s media to his own post');
select throws_ok(
  $$delete from public.posts where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$,
  '42501', null, 'posts have no hard delete from a client (soft delete only)');

-- ------------------------------------------------ media read visibility
-- bob is mutual with alice: friends + public, never private.
select is(
  (select array_agg(provider_asset_id order by provider_asset_id) from public.media_assets
   where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
                'f0000000-0000-4000-8000-000000000003')),
  array['11111111-1111-4111-8111-111111111111/friends.jpg',
        '11111111-1111-4111-8111-111111111111/public.jpg'],
  'bob reads the media rows of alice''s friends and public posts, not the private one');
select is(
  (select array_agg(name order by name) from storage.objects
   where bucket_id = 'media' and name in ('11111111-1111-4111-8111-111111111111/private.jpg', '11111111-1111-4111-8111-111111111111/friends.jpg', '11111111-1111-4111-8111-111111111111/public.jpg')),
  array['11111111-1111-4111-8111-111111111111/friends.jpg',
        '11111111-1111-4111-8111-111111111111/public.jpg'],
  'bob can read (sign) the storage objects of the friends and public posts only');

select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave: no relationship
select is(
  (select array_agg(provider_asset_id order by provider_asset_id) from public.media_assets
   where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
                'f0000000-0000-4000-8000-000000000003')),
  array['11111111-1111-4111-8111-111111111111/public.jpg'],
  'dave reads only the public post''s media row — not private or friends media');
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'media' and name in ('11111111-1111-4111-8111-111111111111/private.jpg',
                                          '11111111-1111-4111-8111-111111111111/friends.jpg')),
  0, 'dave cannot read the private or friends storage objects');
select is((select count(*)::int from public.post_media where post_id = 'f0000000-0000-4000-8000-000000000011'),
  0, 'dave cannot see the private post''s post_media row');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'media' and name in ('11111111-1111-4111-8111-111111111111/private.jpg', '11111111-1111-4111-8111-111111111111/friends.jpg', '11111111-1111-4111-8111-111111111111/public.jpg')),
  3, 'alice reads all three of her own storage objects');
reset role;

set local role anon;
select pg_temp.act_as_anon();
select is(
  (select array_agg(provider_asset_id order by provider_asset_id) from public.media_assets
   where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002',
                'f0000000-0000-4000-8000-000000000003')),
  array['11111111-1111-4111-8111-111111111111/public.jpg'],
  'anon reads only the public post''s media row');
select is(
  (select array_agg(name order by name) from storage.objects
   where bucket_id = 'media' and name in ('11111111-1111-4111-8111-111111111111/private.jpg', '11111111-1111-4111-8111-111111111111/friends.jpg', '11111111-1111-4111-8111-111111111111/public.jpg')),
  array['11111111-1111-4111-8111-111111111111/public.jpg'],
  'anon can list/read only the public post''s storage object');
reset role;

select is((select public from storage.buckets where id = 'media'), false,
  'the media bucket is private (reads go through signed URLs)');

select * from finish();
rollback;
