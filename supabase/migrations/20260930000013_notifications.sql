-- ============================================================================
-- 013 — Push notification infrastructure (brief M3 §2).
--
--   devices              one row per (user, Expo push token). A token belongs
--                        to at most one user: registering it moves it (the
--                        same phone signed into another account).
--   notification_prefs   one row per (user, type) the user changed. A missing
--                        row means the type's default (every type on except
--                        'like').
--   users.quiet_start/   local wall-clock quiet hours, default 22:00-08:00 in
--   users.quiet_end      users.timezone. Equal start and end = none.
--   notifications        the in-app inbox (existing table). Also what the
--                        in-app banner shows when push is denied or on web.
--   ops.notify()         the one way to notify someone: writes the inbox row
--                        and enqueues a 'push' job, both keyed on
--                        (type, user, ref), so notifying twice sends once.
--   ops.push_receipts    Expo tickets, polled for delivery receipts.
--
-- Sending is done by Edge Functions (supabase/functions/push-*), driven by
-- pg_cron through ops.invoke_function (migration 012). Prefs and quiet hours
-- are checked at send time, not enqueue time: a push inside quiet hours is
-- deferred to their end, never dropped.
-- ============================================================================

create type public.notification_type as enum (
  'moment_prompt', 'friend_request', 'friend_accepted', 'followed_live',
  'comment', 'gift_received', 'like', 'support_reply'
);

-- The defaults table from the brief, in one place.
create function public.notification_default(t public.notification_type) returns boolean
language sql immutable as $$
  select t <> 'like';
$$;

-- ---------------------------------------------------------------- preferences
create table public.notification_prefs (
  user_id     uuid not null references public.users(id) on delete cascade,
  type        public.notification_type not null,
  enabled     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, type)
);
alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_prefs from anon, authenticated;
grant select, delete on public.notification_prefs to authenticated;
grant insert (user_id, type, enabled) on public.notification_prefs to authenticated;
grant update (enabled) on public.notification_prefs to authenticated;

-- Every type with the caller's effective setting (for the settings screen and
-- the in-app banner).
create function public.my_notification_prefs()
returns table (type public.notification_type, enabled boolean, is_default boolean)
language sql stable security invoker set search_path = public as $$
  select t, coalesce(p.enabled, public.notification_default(t)), p.enabled is null
    from unnest(enum_range(null::public.notification_type)) as t
    left join public.notification_prefs p on p.user_id = (select auth.uid()) and p.type = t
   order by t;
$$;
revoke execute on function public.my_notification_prefs() from public, anon;
grant execute on function public.my_notification_prefs() to authenticated;

create function ops.notification_enabled(p_user uuid, p_type public.notification_type)
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select enabled from public.notification_prefs where user_id = p_user and type = p_type),
    public.notification_default(p_type));
$$;

-- ---------------------------------------------------------------- quiet hours
alter table public.users
  add column quiet_start time not null default '22:00',
  add column quiet_end   time not null default '08:00';
grant update (quiet_start, quiet_end) on public.users to authenticated;

-- Start inclusive, end exclusive; a window with start > end wraps midnight.
create function ops.in_quiet_hours(p_user uuid, p_at timestamptz) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select case
           when u.quiet_start = u.quiet_end then false
           when u.quiet_start < u.quiet_end
             then (p_at at time zone u.timezone)::time >= u.quiet_start
              and (p_at at time zone u.timezone)::time <  u.quiet_end
           else (p_at at time zone u.timezone)::time >= u.quiet_start
             or (p_at at time zone u.timezone)::time <  u.quiet_end
         end
    from public.users u where u.id = p_user;
$$;

-- The next time the user's local clock reads quiet_end, strictly after p_at.
create function ops.quiet_hours_end(p_user uuid, p_at timestamptz) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select case
           when (p_at at time zone u.timezone)::date + u.quiet_end > (p_at at time zone u.timezone)
             then ((p_at at time zone u.timezone)::date + u.quiet_end) at time zone u.timezone
           else ((p_at at time zone u.timezone)::date + 1 + u.quiet_end) at time zone u.timezone
         end
    from public.users u where u.id = p_user;
$$;

-- ---------------------------------------------------------------- devices
alter table public.devices
  add column token_kind     text not null default 'expo' check (token_kind = 'expo'),
  add column invalidated_at timestamptz,
  add column failure_count  int not null default 0 check (failure_count >= 0),
  add column created_at     timestamptz not null default now(),
  add constraint devices_platform_check check (platform in ('ios', 'android'));
create unique index devices_push_token_key on public.devices (push_token);

revoke insert, update on public.devices from anon, authenticated;
grant insert (user_id, platform, push_token, token_kind) on public.devices to authenticated;
grant update (platform, last_seen_at, invalidated_at) on public.devices to authenticated;

-- Registers (or refreshes) the caller's token. If another account had this
-- token (same phone, different sign-in), it moves to the caller: a phone only
-- ever receives the signed-in person's notifications.
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  delete from public.devices where push_token = p_token and user_id <> uid;
  insert into public.devices (user_id, platform, push_token, token_kind)
  values (uid, p_platform, p_token, 'expo')
  on conflict (user_id, push_token) do update
    set platform = excluded.platform, last_seen_at = now(),
        invalidated_at = null, failure_count = 0;
end $$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- A delivery error for this device. DeviceNotRegistered (the app was
-- uninstalled or the token rotated) invalidates it immediately; other errors
-- count towards the cleanup threshold.
create function ops.device_failed(p_device uuid, p_invalidate boolean) returns void
language sql set search_path = public, pg_temp as $$
  update public.devices
     set invalidated_at = case when p_invalidate then coalesce(invalidated_at, now()) else invalidated_at end,
         failure_count = failure_count + 1
   where id = p_device;
$$;

-- Weekly: drop invalidated tokens, tokens not seen for 270 days (FCM treats
-- those as stale), and tokens with repeated delivery errors. Also trims the
-- receipt and run logs.
create function ops.cleanup_push_tokens() returns int
language plpgsql set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.devices
   where invalidated_at is not null
      or last_seen_at < now() - interval '270 days'
      or failure_count >= 5;
  get diagnostics n = row_count;
  delete from ops.push_receipts where created_at < now() - interval '7 days';
  delete from ops.job_runs where started_at < now() - interval '30 days';
  return n;
end $$;

-- ---------------------------------------------------------------- inbox
alter table public.notifications
  add column data       jsonb not null default '{}'::jsonb,
  add column dedupe_key text unique;

-- Clients read their inbox and mark it read; only ops.notify writes it.
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------- outbox
-- The one entry point for notifying someone. p_ref identifies the thing
-- (e.g. 'comment:<id>'); the same (type, user, ref) never notifies twice.
-- p_data carries what the copy needs (e.g. actor_name) — copy is rendered from
-- (type, data) by src/lib/push/copy.ts, on the device and in push-dispatch.
create function ops.notify(
  p_user uuid, p_type public.notification_type, p_ref text,
  p_data jsonb default '{}'::jsonb, p_actor uuid default null, p_post uuid default null,
  p_run_at timestamptz default now()
) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  key text := p_type::text || ':' || p_user::text || ':' || p_ref;
begin
  if p_data is not null and jsonb_typeof(p_data) <> 'object' then
    raise exception 'notify: data must be a JSON object' using errcode = '22023';
  end if;
  insert into public.notifications (user_id, kind, actor_id, post_id, data, dedupe_key)
  values (p_user, p_type::text, p_actor, p_post, coalesce(p_data, '{}'::jsonb), key)
  on conflict (dedupe_key) do nothing;
  return ops.enqueue('push',
    jsonb_build_object('user_id', p_user, 'type', p_type, 'ref', p_ref,
                       'data', coalesce(p_data, '{}'::jsonb)),
    p_run_at, 'push:' || key);
end $$;

create table ops.push_receipts (
  id          bigint generated always as identity primary key,
  ticket_id   text unique,
  job_id      bigint references ops.job_queue(id) on delete set null,
  device_id   uuid references public.devices(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending', 'ok', 'error', 'expired')),
  error       text,
  message     text,
  created_at  timestamptz not null default now(),
  checked_at  timestamptz
);
create index push_receipts_pending_idx on ops.push_receipts (created_at) where status = 'pending';

revoke all on all tables in schema ops from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;
revoke execute on all functions in schema ops from public, anon, authenticated;

-- ---------------------------------------------------------------- schedule
select cron.schedule('push-dispatch', '* * * * *',    $$select ops.invoke_function('push-dispatch')$$);
select cron.schedule('push-receipts', '*/15 * * * *', $$select ops.invoke_function('push-receipts')$$);
select cron.schedule('token-cleanup', '0 4 * * 0',    $$select ops.invoke_function('token-cleanup')$$);
