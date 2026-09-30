-- ============================================================================
-- 024 — The speech dial (Community Policy v0.2, Colin 2026-09-30). Replaces the
-- Open / Standard / Protected strictness model from 021 / 022.
--
--   public.speech_level            family < standard < open < max (enum order is
--                                  the dial order; comparisons use it).
--   users.speech_level             what this person SEES and can RECEIVE (DMs,
--                                  replies). Default standard. Minors are capped
--                                  at standard: raising above it is refused, and
--                                  a date-of-birth change clamps it.
--   users.default_room_level       RENAMED from default_chat_strictness: the level
--                                  new live streams and new posts start with.
--   live_streams.room_level        RENAMED from chat_strictness.
--   posts.room_level               NEW: the room level for a post's comments,
--                                  defaulting to the author's default_room_level.
--   comments / messages /          required_level: the lowest level the row may
--   live_chat_messages             be shown at (from the content-filter verdict).
--                                  Clients hide / mask above the viewer's level.
--                                  Minors can never SELECT rows above standard
--                                  (open, max) — enforced in the SELECT policies.
--   ops.content_filter_events      + required_level.
--   ops.content_filter_pair_counts per sender -> target hostile-message counter
--                                  (harassment window), Edge Function only.
--
-- Mapping of the old values (documented, applied below):
--   open -> open, standard -> standard, protected -> family.
--   Column renames: chat_strictness -> room_level,
--                   default_chat_strictness -> default_room_level.
--   The old enum public.chat_strictness is dropped.
--
-- Trust note: required_level is written by the client from the Edge Function's
-- verdict (the filter is client-invoked today, like the rest of M3 §5). A
-- client that skips the filter can under-label its own row; server-side send
-- paths are the follow-up.
-- ============================================================================

create type public.speech_level as enum ('family', 'standard', 'open', 'max');

-- ------------------------------------------------------------------ rooms: old strictness -> room level
drop trigger live_streams_default_strictness on public.live_streams;
drop function private.apply_default_chat_strictness();

alter table public.live_streams alter column chat_strictness drop default;
alter table public.live_streams
  alter column chat_strictness type public.speech_level
  using (case chat_strictness::text when 'protected' then 'family' else chat_strictness::text end)::public.speech_level;
alter table public.live_streams rename column chat_strictness to room_level;
alter table public.live_streams alter column room_level set default 'standard';

alter table public.users alter column default_chat_strictness drop default;
alter table public.users
  alter column default_chat_strictness type public.speech_level
  using (case default_chat_strictness::text when 'protected' then 'family' else default_chat_strictness::text end)::public.speech_level;
alter table public.users rename column default_chat_strictness to default_room_level;
alter table public.users alter column default_room_level set default 'standard';

drop type public.chat_strictness;

-- ------------------------------------------------------------------ what each person sees / receives
alter table public.users add column speech_level public.speech_level not null default 'standard';
grant update (speech_level) on public.users to authenticated;

-- Minors: speech_level and default_room_level never above standard. An explicit
-- raise is refused; a date-of-birth change (service role) clamps quietly.
create function private.users_speech_level_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adult boolean := new.date_of_birth is not null
                   and new.date_of_birth <= (current_date - interval '18 years');
begin
  if adult then return new; end if;
  if tg_op = 'UPDATE' and new.date_of_birth is distinct from old.date_of_birth then
    new.speech_level := least(new.speech_level, 'standard'::public.speech_level);
    new.default_room_level := least(new.default_room_level, 'standard'::public.speech_level);
    return new;
  end if;
  if new.speech_level > 'standard' or new.default_room_level > 'standard' then
    raise exception 'speech_level_minor_cap' using errcode = '22023',
      hint = 'People under 18 can choose Family or Standard.';
  end if;
  return new;
end $$;
revoke execute on function private.users_speech_level_guard() from public, anon, authenticated;
create trigger users_speech_level_guard
  before insert or update of speech_level, default_room_level, date_of_birth on public.users
  for each row execute function private.users_speech_level_guard();

-- New streams start at the host's default room level (unless one was given).
create function private.apply_default_room_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.room_level = 'standard' then
    select u.default_room_level into new.room_level from public.users u where u.id = new.host_id;
  end if;
  return new;
end $$;
revoke execute on function private.apply_default_room_level() from public, anon, authenticated;
create trigger live_streams_default_room_level
  before insert on public.live_streams
  for each row execute function private.apply_default_room_level();

-- ------------------------------------------------------------------ per-post comment room level
alter table public.posts add column room_level public.speech_level;
update public.posts p set room_level = u.default_room_level from public.users u where u.id = p.author_id;
alter table public.posts alter column room_level set not null;
alter table public.posts alter column room_level set default 'standard';

-- A new post given the default starts at the author's default (same rule as
-- live streams). A minor author's room is capped at standard.
create function private.posts_room_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.room_level = 'standard' then
    select u.default_room_level into new.room_level from public.users u where u.id = new.author_id;
  end if;
  if not public.is_adult(new.author_id) then
    new.room_level := least(coalesce(new.room_level, 'standard'), 'standard'::public.speech_level);
  end if;
  return new;
end $$;
revoke execute on function private.posts_room_level() from public, anon, authenticated;
create trigger posts_room_level
  before insert or update of room_level on public.posts
  for each row execute function private.posts_room_level();

grant select (room_level) on public.posts to anon, authenticated;
grant insert (room_level), update (room_level) on public.posts to authenticated;

-- ------------------------------------------------------------------ required_level on content rows
alter table public.comments           add column required_level public.speech_level not null default 'family';
alter table public.messages           add column required_level public.speech_level not null default 'family';
alter table public.live_chat_messages add column required_level public.speech_level not null default 'family';

grant insert (required_level), update (required_level) on public.comments to authenticated;
grant insert (required_level), update (required_level) on public.messages to authenticated;
grant insert (required_level) on public.live_chat_messages to authenticated;

-- Is the caller 18+? (anon: no.) For SELECT policies.
create function private.i_am_adult() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_adult(auth.uid());
$$;
revoke execute on function private.i_am_adult() from public;
grant execute on function private.i_am_adult() to anon, authenticated;

-- Minors (and signed-out readers) never receive rows above standard.
drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to anon, authenticated
  using (private.post_id_visible(post_id)
         and (required_level <= 'standard' or private.i_am_adult()));

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (private.i_am_member(conversation_id)
         and (required_level <= 'standard' or sender_id = (select auth.uid()) or private.i_am_adult()));

drop policy live_chat_select on public.live_chat_messages;
create policy live_chat_select on public.live_chat_messages for select to anon, authenticated
  using (required_level <= 'standard' or private.i_am_adult());

-- ------------------------------------------------------------------ content-filter events + harassment counter
alter table ops.content_filter_events add column required_level public.speech_level;

create table ops.content_filter_pair_counts (
  sender_id     uuid not null references public.users(id) on delete cascade,
  target_id     uuid not null references public.users(id) on delete cascade,
  window_start  timestamptz not null default now(),
  hits          integer not null default 1 check (hits > 0),
  primary key (sender_id, target_id),
  constraint content_filter_pair_not_self check (sender_id <> target_id)
);

-- One more hostile message sender -> target; a window older than p_minutes restarts at 1.
create function ops.content_filter_bump_pair(p_sender uuid, p_target uuid, p_minutes integer)
returns integer language sql security definer set search_path = ops, public as $$
  insert into ops.content_filter_pair_counts as c (sender_id, target_id)
  values (p_sender, p_target)
  on conflict (sender_id, target_id) do update
    set hits = case when c.window_start > now() - make_interval(mins => p_minutes) then c.hits + 1 else 1 end,
        window_start = case when c.window_start > now() - make_interval(mins => p_minutes) then c.window_start else now() end
  returning hits;
$$;

revoke all on ops.content_filter_pair_counts from public, anon, authenticated;
revoke execute on function ops.content_filter_bump_pair(uuid, uuid, integer) from public, anon, authenticated;
