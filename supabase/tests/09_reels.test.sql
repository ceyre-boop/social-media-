-- Reels (migration 007): the 30-second cap, reel ↔ video / post ↔ image
-- pairing, poster_path ownership and visibility, and the media bucket config.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- alice 1111…, bob 2222… (mutual 'regular' with alice), dave 5555… (stranger).
-- IDs used below:
--   e…01 alice video 30 s, public reel e…11, poster alice/pub-poster.jpg
--   e…02 alice video 30 s, private reel e…12, poster alice/priv-poster.jpg
--   e…03 alice image, used for the negative pairing tests
--   e…04 alice video 30 s, unattached, for the "post attaches video" test

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice

-- ------------------------------------------------------------ 30-second cap
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, status, provider, provider_asset_id, duration_ms)
    values ('11111111-1111-4111-8111-111111111111', 'video', 'ready', 'supabase',
            '11111111-1111-4111-8111-111111111111/long.mp4', 31000)$$,
  '23514', 'video_too_long', 'a 31 s video is rejected with video_too_long');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, status, provider, provider_asset_id, duration_ms)
    values ('11111111-1111-4111-8111-111111111111', 'video', 'ready', 'supabase',
            '11111111-1111-4111-8111-111111111111/edge.mp4', 30501)$$,
  '23514', 'video_too_long', '30 501 ms is one past the tolerance and is rejected');
select lives_ok(
  $$insert into public.media_assets (owner_id, kind, status, provider, provider_asset_id, duration_ms)
    values ('11111111-1111-4111-8111-111111111111', 'video', 'ready', 'supabase',
            '11111111-1111-4111-8111-111111111111/edge-ok.mp4', 30500)$$,
  '30 500 ms (30 s + container tolerance) is accepted');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, status, provider, provider_asset_id)
    values ('11111111-1111-4111-8111-111111111111', 'video', 'ready', 'supabase',
            '11111111-1111-4111-8111-111111111111/nodur.mp4')$$,
  '23514', 'video_duration_required', 'a video without a duration is rejected');
select lives_ok(
  $$insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id,
                                     poster_path, duration_ms, width, height)
    values ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'video', 'ready',
            'supabase', '11111111-1111-4111-8111-111111111111/pub.mp4',
            '11111111-1111-4111-8111-111111111111/pub-poster.jpg', 30000, 720, 1280),
           ('e0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'video', 'ready',
            'supabase', '11111111-1111-4111-8111-111111111111/priv.mp4',
            '11111111-1111-4111-8111-111111111111/priv-poster.jpg', 30000, 720, 1280),
           ('e0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'video', 'ready',
            'supabase', '11111111-1111-4111-8111-111111111111/spare.mp4', null, 12000, 720, 1280)
    returning id$$,
  'a 30 s video with a poster in the owner''s folder is accepted (INSERT … RETURNING)');
select lives_ok(
  $$insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, width, height)
    values ('e0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'image', 'ready',
            'supabase', '11111111-1111-4111-8111-111111111111/still.jpg', 1080, 1350)$$,
  'images still need no duration');
select throws_ok(
  $$update public.media_assets set duration_ms = 45000 where id = 'e0000000-0000-4000-8000-000000000004'$$,
  '23514', 'video_too_long', 'a video cannot be stretched past the cap by UPDATE');

-- --------------------------------------------------------------- poster_path
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, status, provider, provider_asset_id, poster_path, duration_ms)
    values ('11111111-1111-4111-8111-111111111111', 'video', 'ready', 'supabase',
            '11111111-1111-4111-8111-111111111111/x.mp4',
            '22222222-2222-4222-8222-222222222222/bob-poster.jpg', 10000)$$,
  '42501', null, 'a poster must be inside the uploader''s own folder');
select throws_ok(
  $$update public.media_assets set poster_path = '11111111-1111-4111-8111-111111111111/other.jpg'
    where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'poster_path is insert-only for clients');

-- ------------------------------------------------------- kind pairing
select lives_ok(
  $$insert into public.posts (id, author_id, kind, caption, visibility) values
      ('e0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'reel', 'pub', 'public'),
      ('e0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'reel', 'priv', 'private'),
      ('e0000000-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 'post', 'photo', 'public'),
      ('e0000000-0000-4000-8000-000000000014', '11111111-1111-4111-8111-111111111111', 'story', 's', 'public')$$,
  'alice can create reel, post and story rows');
select lives_ok(
  $$insert into public.post_media (post_id, media_id, position) values
      ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 0),
      ('e0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000002', 0)$$,
  'a reel can attach video');
select throws_ok(
  $$insert into public.post_media (post_id, media_id, position)
    values ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000003', 1)$$,
  '23514', 'reel_requires_video', 'a reel attaching an image is rejected');
select throws_ok(
  $$insert into public.post_media (post_id, media_id, position)
    values ('e0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000004', 0)$$,
  '23514', 'post_requires_image', 'a post attaching a video is rejected');
select lives_ok(
  $$insert into public.post_media (post_id, media_id, position)
    values ('e0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000003', 0)$$,
  'a post can attach an image');
select lives_ok(
  $$insert into public.post_media (post_id, media_id, position)
    values ('e0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000004', 0)$$,
  'stories are unchanged: a story may attach video');

-- Poster + video objects (the app uploads these before registering the row).
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values
      ('media', '11111111-1111-4111-8111-111111111111/pub.mp4',         '11111111-1111-4111-8111-111111111111'),
      ('media', '11111111-1111-4111-8111-111111111111/pub-poster.jpg',  '11111111-1111-4111-8111-111111111111'),
      ('media', '11111111-1111-4111-8111-111111111111/priv.mp4',        '11111111-1111-4111-8111-111111111111'),
      ('media', '11111111-1111-4111-8111-111111111111/priv-poster.jpg', '11111111-1111-4111-8111-111111111111')$$,
  'alice uploads her reel videos and posters into her own folder');
reset role;

-- Re-kinding either side cannot break the pairing (service-role paths).
select throws_ok(
  $$update public.posts set kind = 'post' where id = 'e0000000-0000-4000-8000-000000000011'$$,
  '23514', 'post_requires_image', 'a reel with video cannot be re-kinded into a post');
select throws_ok(
  $$update public.media_assets set kind = 'image' where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '23514', 'reel_requires_video', 'video attached to a reel cannot be re-kinded into an image');

-- ------------------------------------------------ poster read visibility
set local role authenticated;
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave: stranger
select is(
  (select poster_path from public.media_assets where id = 'e0000000-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111/pub-poster.jpg',
  'a stranger who can see the public reel reads its media row with poster_path');
select is(
  (select array_agg(name order by name) from storage.objects
   where bucket_id = 'media'
     and name in ('11111111-1111-4111-8111-111111111111/pub.mp4',
                  '11111111-1111-4111-8111-111111111111/pub-poster.jpg')),
  array['11111111-1111-4111-8111-111111111111/pub-poster.jpg',
        '11111111-1111-4111-8111-111111111111/pub.mp4'],
  'a viewer of the public reel can read (sign) both its video and poster objects');
select is(
  (select count(*)::int from public.media_assets where id = 'e0000000-0000-4000-8000-000000000002'),
  0, 'a stranger cannot see the private reel''s media row');
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'media'
     and name in ('11111111-1111-4111-8111-111111111111/priv.mp4',
                  '11111111-1111-4111-8111-111111111111/priv-poster.jpg')),
  0, 'a stranger cannot read (sign) the private reel''s video or poster');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob: mutual, still not private
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'media' and name = '11111111-1111-4111-8111-111111111111/priv-poster.jpg'),
  0, 'even a mutual cannot read the poster of a private reel');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'media' and name = '11111111-1111-4111-8111-111111111111/priv-poster.jpg'),
  1, 'the owner reads her own private poster');
reset role;

-- ------------------------------------------------------------- media bucket
select is((select public from storage.buckets where id = 'media'), false,
  'the media bucket stays private');
select is((select file_size_limit from storage.buckets where id = 'media'), 62914560::bigint,
  'the media bucket caps objects at 60 MiB');
select is(
  (select allowed_mime_types::text[] from storage.buckets where id = 'media'),
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'],
  'the media bucket accepts images plus mp4/mov video only');

select * from finish();
rollback;
