-- ============================================================================
-- 016 — Moments: friends only, always (brief M3 §1).
--
-- A Moment is a post with kind = 'moment'. Who can see it:
--   the author                                   always
--   an accepted friend (migration 014)           unless deleted or blocked
--   everyone else, anon included                 never
-- The `visibility` column is IGNORED for moments, and cannot be used to widen
-- them: every path that decides post visibility (posts_select, post_id_visible
-- for likes/comments/post_media, media_visible and media_object_visible for
-- files and signed URLs, can_view_post) now goes through
-- private.post_row_visible_for, which checks the kind first.
--
-- Belt and braces: a trigger stores every moment with visibility = 'private',
-- so any query filtering on visibility = 'public' (Discover, the public feed
-- index) can never match one, and any future code that forgets the kind check
-- and falls back on post_visible_for shows it to the author only.
--
-- Also: a moment attaches exactly image media (in-app camera capture; the app
-- has no library import for moments). capture_mode is 'single' for now (front
-- + back is deferred; room left in the column). camera_effect is the preset id
-- that was baked into the JPEG (null = none); it is a record, not a
-- display-time instruction.
-- ============================================================================

alter table public.posts
  add column capture_mode  text not null default 'single' check (capture_mode in ('single')),
  add column camera_effect text check (camera_effect ~ '^[a-z][a-z0-9_]{0,31}$'),
  add constraint posts_camera_effect_moment_only check (camera_effect is null or kind = 'moment');

grant select (capture_mode, camera_effect) on public.posts to anon, authenticated;
grant insert (capture_mode, camera_effect) on public.posts to authenticated;

create index posts_moments_idx on public.posts (author_id, created_at desc)
  where kind = 'moment' and deleted_at is null;

-- ---------------------------------------------------------------- storage shape
create function private.moment_row_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (old.kind = 'moment') is distinct from (new.kind = 'moment') then
    raise exception 'moment_kind_immutable' using errcode = '23514';
  end if;
  if new.kind = 'moment' then
    new.visibility := 'private';
    new.expires_at := null;
  end if;
  return new;
end $$;

create trigger posts_moment_guard
  before insert or update on public.posts
  for each row execute function private.moment_row_guard();

create or replace function private.assert_post_media_kind(p_post_kind public.post_kind,
                                                          p_media_kind public.media_kind)
returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_post_kind = 'reel' and p_media_kind <> 'video' then
    raise exception 'reel_requires_video'
      using errcode = '23514', detail = 'A reel can only attach video.';
  end if;
  if p_post_kind in ('post', 'moment') and p_media_kind <> 'image' then
    raise exception 'post_requires_image'
      using errcode = '23514', detail = 'A post can only attach images.';
  end if;
end $$;

-- ---------------------------------------------------------------- visibility
-- The one decision, with the kind. Moments: author, or accepted friend.
create function private.post_row_visible_for(
  p_author uuid, p_kind public.post_kind, p_visibility public.visibility,
  p_deleted_at timestamptz, p_expires_at timestamptz, p_viewer uuid
) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'moment' then
    if p_viewer is not null and p_author = p_viewer then
      return true;
    end if;
    return p_viewer is not null
       and p_deleted_at is null
       and not private.blocked_between(p_author, p_viewer)
       and private.are_friends(p_author, p_viewer);
  end if;
  return private.post_visible_for(p_author, p_visibility, p_deleted_at, p_expires_at, p_viewer);
end $$;

-- For the posts policy (row values, so INSERT … RETURNING works).
create function private.post_row_visible(
  p_author uuid, p_kind public.post_kind, p_visibility public.visibility,
  p_deleted_at timestamptz, p_expires_at timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  select private.post_row_visible_for(p_author, p_kind, p_visibility, p_deleted_at, p_expires_at, auth.uid());
$$;

drop policy posts_select on public.posts;
create policy posts_select on public.posts for select to anon, authenticated
  using (private.post_row_visible(author_id, kind, visibility, deleted_at, expires_at));

create or replace function private.post_id_visible(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select private.post_row_visible_for(p.author_id, p.kind, p.visibility, p.deleted_at,
                                         p.expires_at, auth.uid())
     from public.posts p where p.id = p_post),
    false);
$$;

create or replace function private.media_visible(p_media uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.media_assets m
    where m.id = p_media
      and (m.owner_id = auth.uid()
           or (m.status = 'ready' and m.deleted_at is null
               and (exists (select 1
                            from public.post_media pm
                            join public.posts p on p.id = pm.post_id
                            where pm.media_id = m.id
                              and private.post_row_visible_for(p.author_id, p.kind, p.visibility,
                                                               p.deleted_at, p.expires_at, auth.uid()))
                    or exists (select 1 from public.profiles pr
                               where pr.avatar_media_id = m.id
                                 and not private.blocked_between(pr.user_id, auth.uid()))))));
$$;

create or replace function public.can_view_post(p_post uuid, p_viewer uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p public.posts%rowtype;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and p_viewer is distinct from auth.uid() then
    return false;
  end if;
  select * into p from public.posts where id = p_post;
  if not found then
    return false;
  end if;
  return private.post_row_visible_for(p.author_id, p.kind, p.visibility, p.deleted_at,
                                      p.expires_at, p_viewer);
end $$;

revoke execute on function private.moment_row_guard() from public, anon, authenticated;
revoke execute on function private.post_row_visible_for(uuid, public.post_kind, public.visibility,
                                                        timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function private.post_row_visible(uuid, public.post_kind, public.visibility,
                                                    timestamptz, timestamptz)
  from public;
grant  execute on function private.post_row_visible(uuid, public.post_kind, public.visibility,
                                                    timestamptz, timestamptz)
  to anon, authenticated;
