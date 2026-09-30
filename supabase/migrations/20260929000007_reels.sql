-- ============================================================================
-- 007 — Reels: 30-second cap, reel/post media kinds, poster frames, video types.
--
-- Milestone 2 product rules (Colin, 2026-09-29), enforced in the database so a
-- modified client cannot bypass them (same lesson as the age rules):
--   * A video is at most 30 seconds. media_assets.kind = 'video' requires a
--     positive duration_ms of at most 30 500 ms (500 ms container tolerance).
--       - missing / non-positive duration → 'video_duration_required'
--       - longer than the cap             → 'video_too_long'
--   * posts.kind = 'reel' attaches only video media ('reel_requires_video');
--     posts.kind = 'post' attaches only image media ('post_requires_image').
--     'story' is unchanged. The pairing is checked whichever side changes:
--     attaching (post_media), re-kinding a post, or re-kinding a media row.
--   * media_assets.poster_path — storage path of a reel's poster JPEG. Client
--     writable on INSERT only, and only inside the owner's own folder. A viewer
--     who can see the media row can also read (sign) its poster object.
--   * Bucket `media` stays private; accepts images and mp4/mov video, 60 MiB.
--
-- Errors are raised with SQLSTATE 23514 (check_violation) and the token as the
-- message, so the app can map them to plain copy.
-- ============================================================================

-- ---------------------------------------------------------------- poster_path
alter table media_assets add column poster_path text;

-- Holds for every writer, including the service role: a poster lives in the
-- media owner's folder, never someone else's.
alter table media_assets
  add constraint media_assets_poster_in_owner_folder
  check (poster_path is null or starts_with(poster_path, owner_id::text || '/'));

create index media_poster_path_idx on media_assets (poster_path) where poster_path is not null;

-- Column grants: poster_path is insert-only for clients (not in the UPDATE list,
-- so a published reel's poster cannot be swapped to another object later).
revoke insert, update on media_assets from anon, authenticated;
grant  insert (id, owner_id, kind, status, provider, provider_asset_id, poster_path,
               duration_ms, width, height, bytes, content_hash)
  on media_assets to authenticated;
grant  update (status, duration_ms, width, height, bytes, content_hash, deleted_at)
  on media_assets to authenticated;

-- Clients may only register a poster inside their own folder (the check
-- constraint already ties it to owner_id; this keeps the policy self-evident).
drop policy media_insert_own on media_assets;
create policy media_insert_own on media_assets for insert to authenticated
  with check (owner_id = (select auth.uid())
              and provider_asset_id is not null
              and starts_with(provider_asset_id, (select auth.uid())::text || '/')
              and (poster_path is null
                   or starts_with(poster_path, (select auth.uid())::text || '/')));

-- ------------------------------------------------------------ 30-second cap
create function private.enforce_video_duration() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'video' then
    if new.duration_ms is null or new.duration_ms <= 0 then
      raise exception 'video_duration_required'
        using errcode = '23514',
              detail = 'A video needs its duration in milliseconds.';
    end if;
    if new.duration_ms > 30500 then
      raise exception 'video_too_long'
        using errcode = '23514',
              detail = format('Videos are capped at 30 seconds; got %s ms.', new.duration_ms);
    end if;
  end if;
  return new;
end $$;

revoke execute on function private.enforce_video_duration() from public, anon, authenticated;

create trigger media_assets_video_duration
  before insert or update of kind, duration_ms on media_assets
  for each row execute function private.enforce_video_duration();

-- ------------------------------------------------ post kind ↔ media kind
-- The raise for one (post kind, media kind) pair. 'story' accepts any media.
create function private.assert_post_media_kind(p_post_kind public.post_kind,
                                               p_media_kind public.media_kind)
returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_post_kind = 'reel' and p_media_kind <> 'video' then
    raise exception 'reel_requires_video'
      using errcode = '23514', detail = 'A reel can only attach video.';
  end if;
  if p_post_kind = 'post' and p_media_kind <> 'image' then
    raise exception 'post_requires_image'
      using errcode = '23514', detail = 'A post can only attach images.';
  end if;
end $$;

-- Attaching media. security definer: the kinds must be read even where the
-- inserting role could not see the rows (RLS on posts/media_assets).
create function private.check_post_media_kind() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_post_kind  public.post_kind;
  v_media_kind public.media_kind;
begin
  select p.kind into v_post_kind from public.posts p where p.id = new.post_id;
  select m.kind into v_media_kind from public.media_assets m where m.id = new.media_id;
  -- Missing rows are left to the foreign keys, which fail with their own error.
  if v_post_kind is not null and v_media_kind is not null then
    perform private.assert_post_media_kind(v_post_kind, v_media_kind);
  end if;
  return new;
end $$;

create trigger post_media_kind_matches
  before insert or update of post_id, media_id on post_media
  for each row execute function private.check_post_media_kind();

-- Re-kinding a post that already has media (clients cannot update posts.kind;
-- this covers the service role and future code paths).
create function private.check_post_kind_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_media_kind public.media_kind;
begin
  for v_media_kind in
    select m.kind from public.post_media pm
    join public.media_assets m on m.id = pm.media_id
    where pm.post_id = new.id
  loop
    perform private.assert_post_media_kind(new.kind, v_media_kind);
  end loop;
  return new;
end $$;

create trigger posts_kind_matches_media
  before update of kind on posts
  for each row when (old.kind is distinct from new.kind)
  execute function private.check_post_kind_change();

-- Re-kinding media that is already attached.
create function private.check_media_kind_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_post_kind public.post_kind;
begin
  for v_post_kind in
    select p.kind from public.post_media pm
    join public.posts p on p.id = pm.post_id
    where pm.media_id = new.id
  loop
    perform private.assert_post_media_kind(v_post_kind, new.kind);
  end loop;
  return new;
end $$;

create trigger media_assets_kind_matches_posts
  before update of kind on media_assets
  for each row when (old.kind is distinct from new.kind)
  execute function private.check_media_kind_change();

revoke execute on function private.assert_post_media_kind(public.post_kind, public.media_kind)
  from public, anon, authenticated;
revoke execute on function private.check_post_media_kind()  from public, anon, authenticated;
revoke execute on function private.check_post_kind_change() from public, anon, authenticated;
revoke execute on function private.check_media_kind_change() from public, anon, authenticated;

-- --------------------------------------------------- poster object visibility
-- A storage object is readable (signable) through a visible media row that
-- points at it either as the media itself or as its poster frame.
create or replace function private.media_object_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.media_assets m
    where (m.provider_asset_id = p_name or m.poster_path = p_name)
      and private.media_visible(m.id));
$$;

-- ------------------------------------------------------------ media bucket
-- Private, images + mp4/mov video, 60 MiB per object. (The local stack's
-- global cap in supabase/config.toml [storage].file_size_limit must be at
-- least this; hosted projects set it in the dashboard.)
update storage.buckets
   set public = false,
       file_size_limit = 62914560,  -- 60 MiB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
                                  'video/mp4', 'video/quicktime']
 where id = 'media';
