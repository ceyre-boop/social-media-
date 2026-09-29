-- The vertical slice's client write paths (brief §8): upload → media_assets →
-- post → post_media, and the negative cases around each.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('media', '11111111-1111-4111-8111-111111111111/photo.jpg', '11111111-1111-4111-8111-111111111111')$$,
  'alice can upload into her own folder of the media bucket');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('media', '22222222-2222-4222-8222-222222222222/photo.jpg', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'alice cannot upload into bob''s folder');

select lives_ok(
  $$insert into public.media_assets (id, owner_id, kind, status, provider, playback_url, width, height)
    values ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
            'image', 'ready', 'supabase', 'media/11111111-1111-4111-8111-111111111111/photo.jpg', 1080, 1350)$$,
  'alice can register her own media asset');
select throws_ok(
  $$insert into public.media_assets (owner_id, kind, provider)
    values ('22222222-2222-4222-8222-222222222222', 'image', 'supabase')$$,
  '42501', null, 'alice cannot register media owned by bob');

select lives_ok(
  $$insert into public.posts (id, author_id, kind, caption, visibility)
    values ('f0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
            'post', 'new photo', 'public')$$,
  'alice can create a post');
select lives_ok(
  $$insert into public.post_media (post_id, media_id)
    values ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001')$$,
  'alice can attach her media to her post');
select throws_ok(
  $$insert into public.posts (author_id, kind, caption)
    values ('22222222-2222-4222-8222-222222222222', 'post', 'forged')$$,
  '42501', null, 'alice cannot create a post as bob');
select lives_ok(
  $$update public.posts set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000005'$$,
  'alice can soft-delete her own post');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
select throws_ok(
  $$insert into public.posts (id, author_id, kind) values
      ('f0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'post');
    insert into public.post_media (post_id, media_id)
    values ('f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'bob cannot attach alice''s media to his own post');
select is(
  (select count(*)::int from public.post_media where post_id = 'f0000000-0000-4000-8000-000000000002'),
  1, 'bob can see the media rows of alice''s public post');
select throws_ok(
  $$delete from public.posts where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$,
  '42501', null, 'posts have no hard delete from a client (soft delete only)');
reset role;

select * from finish();
rollback;
