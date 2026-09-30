-- Migration 017: moment prompt scheduler (idempotent per user/day/slot, inside
-- waking hours, outside quiet hours, across timezones and DST, respects the
-- pref) and dispatcher (sends via ops.notify, drops/defers correctly).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- alice 1111, bob 2222, carol 4444 from seed.
create function pg_temp.jobs(uid uuid) returns int language sql as $$
  select count(*)::int from ops.job_queue where kind = 'moment_prompt' and payload->>'user_id' = uid::text;
$$;

-- Every prompt job of `uid` whose local time is outside waking hours, inside
-- quiet hours, or not on the local date it was scheduled for.
create function pg_temp.bad_times(uid uuid) returns int language sql as $$
  select count(*)::int
    from ops.job_queue j join public.users u on u.id = uid
   where j.kind = 'moment_prompt' and j.payload->>'user_id' = uid::text
     and (   (j.run_at at time zone u.timezone)::time <  u.waking_start
          or (j.run_at at time zone u.timezone)::time >= u.waking_end
          or (j.run_at at time zone u.timezone)::date <> (j.payload->>'local_date')::date
          or ops.in_quiet_hours(uid, j.run_at));
$$;

update public.users set timezone = 'America/New_York', moment_prompts_per_day = 2,
       quiet_start = '12:00', quiet_end = '14:00'        -- a midday quiet window, to prove it is avoided
 where id = '11111111-1111-4111-8111-111111111111';
update public.users set timezone = 'Asia/Tokyo'
 where id = '22222222-2222-4222-8222-222222222222';
insert into public.notification_prefs (user_id, type, enabled)
values ('44444444-4444-4444-8444-444444444444', 'moment_prompt', false);

-- ------------------------------------------------------------------ defaults
select is((select (waking_start, waking_end, moment_prompts_per_day)::text from public.users
            where id = '55555555-5555-4555-8555-555555555555'), '(09:00:00,21:00:00,)',
          'waking hours default to 09:00-21:00; prompts per day default to a random 1-2');
select throws_ok($$update public.users set waking_start = '22:00', waking_end = '06:00' where id = '55555555-5555-4555-8555-555555555555'$$,
                 '23514', null, 'waking hours may not wrap midnight');

-- ------------------------------------------------------------------ scheduling, idempotency
-- 2026-10-02 05:00Z = 01:00 in New York (EDT), 14:00 in Tokyo.
select ops.schedule_moment_prompts('2026-10-02 05:00Z');
select is(pg_temp.jobs('11111111-1111-4111-8111-111111111111'), 2, 'alice (2 a day) gets two prompts for her new local day');
select ok(pg_temp.jobs('22222222-2222-4222-8222-222222222222') between 0 and 2,
          'bob (random 1-2, Tokyo afternoon) gets at most two, only in the part of his day that is left');
select is(pg_temp.jobs('44444444-4444-4444-8444-444444444444'), 0, 'carol turned prompts off: nothing scheduled');

select is(ops.schedule_moment_prompts('2026-10-02 05:00Z'), 0, 'running the sweep again adds nothing');
select is(ops.schedule_moment_prompts('2026-10-02 05:40Z'), 0, 'nor does the next hourly sweep on the same local day');
select is(pg_temp.jobs('11111111-1111-4111-8111-111111111111'), 2, 'alice still has exactly two');
select is((select count(*)::int from ops.job_queue where kind = 'moment_prompt' and payload->>'user_id' = '11111111-1111-4111-8111-111111111111'
             and idempotency_key in ('moment_prompt:11111111-1111-4111-8111-111111111111:2026-10-02:1',
                                     'moment_prompt:11111111-1111-4111-8111-111111111111:2026-10-02:2')),
          2, 'idempotency key = user + local date + slot');
select is(ops.enqueue('moment_prompt', '{}'::jsonb, now(), 'moment_prompt:11111111-1111-4111-8111-111111111111:2026-10-02:1'),
          (select id from ops.job_queue where idempotency_key = 'moment_prompt:11111111-1111-4111-8111-111111111111:2026-10-02:1'),
          'enqueueing the same user/day/slot again returns the existing job');
select ok((select abs(extract(epoch from max(run_at) - min(run_at))) >= 90 * 60 from ops.job_queue
            where kind = 'moment_prompt' and payload->>'user_id' = '11111111-1111-4111-8111-111111111111'),
          'the two prompts are at least 90 minutes apart');

-- A month of days, both users, including the New York DST change (2026-11-01).
do $$
begin
  for d in 0 .. 34 loop
    perform ops.schedule_moment_prompts(timestamptz '2026-10-03 05:00Z' + make_interval(days => d));
  end loop;
end $$;
select is(pg_temp.bad_times('11111111-1111-4111-8111-111111111111'), 0,
          'New York: every prompt over 35 days is inside waking hours and outside quiet hours');
select is(pg_temp.bad_times('22222222-2222-4222-8222-222222222222'), 0,
          'Tokyo: the same');
select is((select count(*)::int from ops.moment_prompt_days where user_id = '11111111-1111-4111-8111-111111111111'
             and local_date = '2026-11-01' and slots = 2), 1, 'the DST day was scheduled normally');
select is((select count(*)::int from ops.job_queue where kind = 'moment_prompt'
             and payload->>'user_id' = '11111111-1111-4111-8111-111111111111'
             and payload->>'local_date' = '2026-11-01'), 2, 'two prompts on the DST day');
select is(pg_temp.jobs('44444444-4444-4444-8444-444444444444'), 0, 'carol: still nothing, every day');

-- Joining late in the day: nothing left of the waking window, no prompt.
update public.users set timezone = 'UTC', moment_prompts_per_day = 2 where id = '55555555-5555-4555-8555-555555555555';
delete from ops.moment_prompt_days where user_id = '55555555-5555-4555-8555-555555555555';
delete from ops.job_queue where kind = 'moment_prompt' and payload->>'user_id' = '55555555-5555-4555-8555-555555555555';
select ops.schedule_moment_prompts('2027-01-15 20:58Z');
select is(pg_temp.jobs('55555555-5555-4555-8555-555555555555'), 0, 'at 20:58 there is no waking time left today: no prompt');

-- ------------------------------------------------------------------ dispatcher
-- Only dave's prompt is due. No quiet hours for dave.
update ops.job_queue set run_at = now() + interval '1 year' where kind = 'moment_prompt';
update public.users set quiet_start = '00:00', quiet_end = '00:00' where id = '55555555-5555-4555-8555-555555555555';
select ops.enqueue('moment_prompt', '{"user_id":"55555555-5555-4555-8555-555555555555","local_date":"2027-01-16","slot":1}',
                   now() - interval '1 minute', 'test:dave:1');
select is(ops.dispatch_moment_prompts(), 1, 'the due prompt is sent');
select is((select count(*)::int from public.notifications
            where user_id = '55555555-5555-4555-8555-555555555555' and kind = 'moment_prompt'
              and (data->>'line')::int between 0 and 6), 1, 'through ops.notify: an inbox row with a copy line');
select is((select count(*)::int from ops.job_queue where kind = 'push'
            and payload->>'user_id' = '55555555-5555-4555-8555-555555555555' and payload->>'type' = 'moment_prompt'),
          1, 'and a push job');
select is((select status::text from ops.job_queue where idempotency_key = 'test:dave:1'), 'done', 'the prompt job is done');

-- Turned off after scheduling: dropped silently.
insert into public.notification_prefs (user_id, type, enabled)
values ('55555555-5555-4555-8555-555555555555', 'moment_prompt', false);
select ops.enqueue('moment_prompt', '{"user_id":"55555555-5555-4555-8555-555555555555","local_date":"2027-01-16","slot":2}',
                   now() - interval '1 minute', 'test:dave:2');
select is(ops.dispatch_moment_prompts(), 0, 'prompts turned off since scheduling: nothing sent');
delete from public.notification_prefs where user_id = '55555555-5555-4555-8555-555555555555';

-- Inside quiet hours now: deferred to their end, never sent inside them.
update public.users
   set quiet_start = ((now() at time zone 'UTC') - interval '1 hour')::time,
       quiet_end   = ((now() at time zone 'UTC') + interval '1 hour')::time
 where id = '55555555-5555-4555-8555-555555555555';
select ops.enqueue('moment_prompt', '{"user_id":"55555555-5555-4555-8555-555555555555","local_date":"2027-01-17","slot":1}',
                   now() - interval '1 minute', 'test:dave:3');
select ops.dispatch_moment_prompts();
select is((select (status::text, run_at = ops.quiet_hours_end('55555555-5555-4555-8555-555555555555', now()))::text
             from ops.job_queue where idempotency_key = 'test:dave:3'),
          '(queued,t)', 'inside quiet hours: deferred to the end of quiet hours');

-- Very late (dispatcher was down): dropped, not sent hours later.
update public.users set quiet_start = '00:00', quiet_end = '00:00' where id = '55555555-5555-4555-8555-555555555555';
update ops.job_queue set run_at = now() + interval '1 year' where idempotency_key = 'test:dave:3';
select ops.enqueue('moment_prompt', '{"user_id":"55555555-5555-4555-8555-555555555555","local_date":"2027-01-18","slot":1}',
                   now() - interval '7 hours', 'test:dave:4');
select is(ops.dispatch_moment_prompts(), 0, 'a prompt more than 6 hours late is dropped');

select * from finish();
rollback;
