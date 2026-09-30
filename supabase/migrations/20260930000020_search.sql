-- Phase 4A: user search. Prefix + trigram over username and display name.
-- No counts in the result. Blocks (either direction), non-active, deleted and
-- the caller are excluded. Signed-in only, rate limited per user.

create index if not exists profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

-- Sliding-window log for the rate limit. Private: only the RPC touches it.
create schema if not exists ops;
create table if not exists ops.search_hits (
  user_id uuid not null,
  at      timestamptz not null default clock_timestamp()
);
create index if not exists search_hits_user_at on ops.search_hits (user_id, at desc);
revoke all on ops.search_hits from public, anon, authenticated;

create or replace function public.search_users(q text, lim int default 20)
returns table (
  user_id         uuid,
  username        text,
  display_name    text,
  avatar_media_id uuid,
  bio_snippet     text
)
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp as $$
declare
  me     uuid := auth.uid();
  norm   text;
  n      int  := greatest(1, least(coalesce(lim, 20), 50));
  hits   int;
  pat    text;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Sliding window: 30 searches per rolling minute per user.
  delete from ops.search_hits h where h.user_id = me and h.at < clock_timestamp() - interval '1 minute';
  select count(*) into hits from ops.search_hits h where h.user_id = me;
  if hits >= 30 then
    raise exception 'search_rate_limited' using errcode = 'P0001';
  end if;
  insert into ops.search_hits (user_id) values (me);

  norm := lower(btrim(coalesce(q, '')));
  norm := regexp_replace(norm, '^@+', '');
  if norm = '' then return; end if;
  -- Escape LIKE metacharacters.
  pat := replace(replace(replace(norm, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select p.user_id,
         p.username::text,
         p.display_name,
         p.avatar_media_id,
         left(p.bio, 120)
  from public.profiles p
  join public.users u on u.id = p.user_id
  where p.user_id <> me
    and u.status = 'active'
    and u.deleted_at is null
    and not private.blocked_between(me, p.user_id)
    and (
      lower(p.username::text) like pat || '%'
      or lower(coalesce(p.display_name, '')) like pat || '%'
      or (length(norm) >= 3 and (
            similarity(lower(p.username::text), norm) >= 0.2
         or similarity(lower(coalesce(p.display_name, '')), norm) >= 0.2))
    )
  order by
    case
      when lower(p.username::text) = norm then 0
      when lower(p.username::text) like pat || '%' then 1
      when lower(coalesce(p.display_name, '')) like pat || '%' then 2
      else 3
    end,
    greatest(similarity(lower(p.username::text), norm),
             similarity(lower(coalesce(p.display_name, '')), norm)) desc,
    p.username::text
  limit n;
end $$;

revoke execute on function public.search_users(text, int) from public, anon;
grant  execute on function public.search_users(text, int) to authenticated;
