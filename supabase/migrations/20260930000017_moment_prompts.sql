-- ============================================================================
-- 017 — Moment prompts: scheduler + dispatcher (brief M3 §1 "Behavior", §3).
--
-- An invitation, not a game: 1–2 prompts a day at random times inside the
-- person's waking hours, never inside quiet hours, no expiry, no streaks, no
-- counts. Posting a Moment never depends on a prompt.
--
--   users.waking_start / waking_end   local wall clock, default 09:00–21:00.
--                                     Must not wrap midnight (start < end).
--   users.moment_prompts_per_day      1 or 2; null (default) = pick 1 or 2 at
--                                     random each day.
--   notification_prefs 'moment_prompt' (migration 013) turns prompts off.
--
-- Scheduler, ops.schedule_moment_prompts(now), pg_cron hourly:
--   For every active person whose CURRENT LOCAL DATE has no entry in
--   ops.moment_prompt_days yet (i.e. their date rolled over since the last
--   sweep, or they are new), record the day, and if prompts are on, pick the
--   day's times and enqueue one 'moment_prompt' job per slot with
--   idempotency key moment_prompt:<user>:<local date>:<slot>.
--   Times are drawn from a 5-minute grid over [waking_start, waking_end), in
--   the person's timezone (DST handled by Postgres' zone rules: every
--   candidate is converted to an instant and re-checked in local time, so a
--   skipped or repeated hour can't produce an out-of-window time), minus quiet
--   hours (ops.in_quiet_hours), minus the past. Two slots are kept at least 90
--   minutes apart when the window allows. A day that has nothing left (joined
--   at 20:58) gets no prompt. Running the sweep twice never adds anything: the
--   day row is the gate, the idempotency keys are the backstop.
--
-- Dispatcher, ops.dispatch_moment_prompts(), pg_cron every 5 minutes:
--   claims due prompt jobs and calls ops.notify(user, 'moment_prompt', …),
--   which writes the in-app inbox row and enqueues the push (push-dispatch
--   re-checks prefs + quiet hours at send time). At dispatch time:
--     prompts turned off since scheduling → dropped (job completed, no notify)
--     now inside quiet hours              → deferred to quiet hours' end
--     more than 6 hours late              → dropped (a stale nudge is noise;
--                                            it never "expires" for the person,
--                                            since tapping any prompt later
--                                            opens the camera just the same)
--   The copy line is picked at random here (data.line) and rendered by
--   src/lib/push/copy.ts.
-- ============================================================================

alter table public.users
  add column waking_start time not null default '09:00',
  add column waking_end   time not null default '21:00',
  add column moment_prompts_per_day smallint check (moment_prompts_per_day in (1, 2)),
  add constraint users_waking_hours_order check (waking_start < waking_end);
grant update (waking_start, waking_end, moment_prompts_per_day) on public.users to authenticated;

create table ops.moment_prompt_days (
  user_id     uuid not null references public.users(id) on delete cascade,
  local_date  date not null,
  slots       smallint not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- Picks up to p_count instants for p_user on p_local_date, after p_now.
create function ops.pick_moment_prompt_times(
  p_user uuid, p_local_date date, p_count int, p_now timestamptz
) returns timestamptz[]
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  u public.users%rowtype;
  cands timestamptz[];
  picked timestamptz[] := '{}';
  c timestamptz;
begin
  select * into u from public.users where id = p_user;
  if not found or p_count < 1 then
    return picked;
  end if;
  select coalesce(array_agg(ts order by random()), '{}') into cands
    from (
      select (p_local_date + make_interval(mins => m)) at time zone u.timezone as ts
        from generate_series(
               (extract(epoch from u.waking_start) / 60)::int,
               (extract(epoch from u.waking_end) / 60)::int - 1, 5) as m
    ) g
   where ts > p_now
     and (ts at time zone u.timezone)::date = p_local_date
     and (ts at time zone u.timezone)::time >= u.waking_start
     and (ts at time zone u.timezone)::time <  u.waking_end
     and not ops.in_quiet_hours(p_user, ts);

  foreach c in array cands loop
    exit when cardinality(picked) >= p_count;
    if cardinality(picked) = 0
       or not exists (select 1 from unnest(picked) p where abs(extract(epoch from c - p)) < 90 * 60) then
      picked := picked || c;
    end if;
  end loop;
  -- Narrow window: take any other time rather than drop the second slot.
  foreach c in array cands loop
    exit when cardinality(picked) >= p_count;
    if not c = any(picked) then
      picked := picked || c;
    end if;
  end loop;
  return (select array_agg(x order by x) from unnest(picked) x);
end $$;

create function ops.schedule_moment_prompts(p_now timestamptz default now()) returns int
language plpgsql set search_path = public, pg_temp as $$
declare
  run bigint := ops.start_run('moment-prompt-schedule');
  u record;
  day date;
  n int;
  times timestamptz[];
  i int;
  users_done int := 0;
  jobs int := 0;
begin
  for u in
    select us.id, us.timezone, us.moment_prompts_per_day
      from public.users us
     where us.status = 'active'
       and exists (select 1 from public.profiles p where p.user_id = us.id)
       and not exists (select 1 from ops.moment_prompt_days d
                        where d.user_id = us.id
                          and d.local_date = (p_now at time zone us.timezone)::date)
  loop
    day := (p_now at time zone u.timezone)::date;
    insert into ops.moment_prompt_days (user_id, local_date) values (u.id, day)
    on conflict do nothing;
    if not found then
      continue;  -- a concurrent sweep got there first
    end if;
    users_done := users_done + 1;
    if not ops.notification_enabled(u.id, 'moment_prompt') then
      continue;
    end if;
    n := coalesce(u.moment_prompts_per_day, 1 + floor(random() * 2)::int);
    times := coalesce(ops.pick_moment_prompt_times(u.id, day, n, p_now), '{}');
    for i in 1 .. cardinality(times) loop
      perform ops.enqueue('moment_prompt',
        jsonb_build_object('user_id', u.id, 'local_date', day, 'slot', i),
        times[i],
        'moment_prompt:' || u.id::text || ':' || day::text || ':' || i::text);
      jobs := jobs + 1;
    end loop;
    update ops.moment_prompt_days set slots = cardinality(times)
     where user_id = u.id and local_date = day;
  end loop;

  delete from ops.moment_prompt_days where local_date < (p_now - interval '7 days')::date;
  perform ops.finish_run(run, 'ok', jsonb_build_object('users', users_done, 'jobs', jobs));
  return jobs;
end $$;

-- How many prompt lines copy.ts has (data.line is 0 .. this - 1).
create function ops.moment_prompt_line_count() returns int
language sql immutable as $$ select 7 $$;

create function ops.dispatch_moment_prompts(p_limit int default 500) returns int
language plpgsql set search_path = public, pg_temp as $$
declare
  run bigint := ops.start_run('moment-prompt-dispatch');
  j ops.job_queue;
  uid uuid;
  sent int := 0;
  skipped int := 0;
  deferred int := 0;
begin
  for j in select * from ops.claim('moment_prompt', p_limit, 'sql:moment-prompt-dispatch') loop
    begin
      uid := (j.payload->>'user_id')::uuid;
      if not exists (select 1 from public.users where id = uid and status = 'active')
         or not ops.notification_enabled(uid, 'moment_prompt')
         or j.run_at < now() - interval '6 hours' then
        perform ops.complete(j.id);
        skipped := skipped + 1;
      elsif ops.in_quiet_hours(uid, now()) then
        perform ops.defer(j.id, ops.quiet_hours_end(uid, now()));
        deferred := deferred + 1;
      else
        perform ops.notify(uid, 'moment_prompt',
          'moment_prompt:' || (j.payload->>'local_date') || ':' || (j.payload->>'slot'),
          jsonb_build_object('line', floor(random() * ops.moment_prompt_line_count())::int));
        perform ops.complete(j.id);
        sent := sent + 1;
      end if;
    exception when others then
      perform ops.fail(j.id, sqlerrm);
    end;
  end loop;
  perform ops.finish_run(run, 'ok',
    jsonb_build_object('sent', sent, 'skipped', skipped, 'deferred', deferred));
  return sent;
end $$;

revoke all on all tables in schema ops from public, anon, authenticated;
revoke execute on all functions in schema ops from public, anon, authenticated;

select cron.schedule('moment-prompt-schedule', '5 * * * *',   $$select ops.schedule_moment_prompts()$$);
select cron.schedule('moment-prompt-dispatch', '*/5 * * * *', $$select ops.dispatch_moment_prompts()$$);
