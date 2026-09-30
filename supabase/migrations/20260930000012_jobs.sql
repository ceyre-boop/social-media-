-- ============================================================================
-- 012 — Scheduled-job infrastructure (brief M3 §3) and users.timezone.
--
-- Build it once: prompts, token cleanup, and later relationship recompute and
-- payout runs all go through here.
--
--   ops.job_queue   durable work items. Every job has an idempotency key
--                   (unique, forever): enqueueing the same key twice is a
--                   no-op, so a scheduler that runs twice never double-sends.
--   ops.job_runs    queryable run log: which job, when, how long, outcome.
--
-- Lifecycle:  queued --claim--> running --complete--> done
--                                  |--fail--> queued (backoff 1m * 2^(attempts-1), cap 1h)
--                                  |--fail on the last attempt--> dead (dead letter)
--                                  |--defer--> queued at a later time, attempt refunded
--             A worker that dies holding a job: its lease expires and the job
--             is claimable again (or dead if that was its last attempt).
--
-- Delivery is at-least-once between "the side effect happened" and
-- "complete() committed": a worker that crashes in that window will retry.
-- Handlers keep that window small and record side effects before completing.
--
-- `ops` is not an API schema (config.toml exposes public/graphql_public only)
-- and clients get no privileges on it. Edge Functions reach it through a
-- direct database connection (SUPABASE_DB_URL), never through PostgREST.
--
-- Scheduling: pg_cron runs the clock, pg_net calls Edge Functions. The project
-- URL and service-role key the calls need are read at call time from Supabase
-- Vault (names: project_url, service_role_key) and are never in the repo.
-- Local setup: `bun scripts/setup-local-cron.ts`.
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
alter default privileges in schema ops revoke execute on functions from public;

create type ops.job_status as enum ('queued', 'running', 'done', 'dead');
create type ops.run_outcome as enum ('ok', 'error', 'skipped');

create table ops.job_queue (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind ~ '^[a-z][a-z0-9_]*$'),
  payload          jsonb not null default '{}'::jsonb,
  run_at           timestamptz not null default now(),
  idempotency_key  text not null unique,
  attempts         int not null default 0 check (attempts >= 0),
  max_attempts     int not null default 5 check (max_attempts > 0),
  status           ops.job_status not null default 'queued',
  last_error       text,
  locked_at        timestamptz,
  locked_by        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index job_queue_due_idx on ops.job_queue (kind, run_at)
  where status in ('queued', 'running');

create table ops.job_runs (
  id           bigint generated always as identity primary key,
  job_name     text not null,
  started_at   timestamptz not null default clock_timestamp(),
  finished_at  timestamptz,
  duration_ms  int,
  outcome      ops.run_outcome,
  detail       jsonb not null default '{}'::jsonb
);
create index job_runs_name_idx on ops.job_runs (job_name, started_at desc);

-- ---------------------------------------------------------------- queue API

-- Idempotent: returns the id of the job with this key, new or existing. An
-- existing job is never modified (its payload, schedule and status stand).
create function ops.enqueue(
  p_kind text, p_payload jsonb, p_run_at timestamptz, p_idempotency_key text,
  p_max_attempts int default 5
) returns bigint
language plpgsql set search_path = ops, pg_temp as $$
declare
  new_id bigint;
begin
  insert into ops.job_queue (kind, payload, run_at, idempotency_key, max_attempts)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()),
          p_idempotency_key, p_max_attempts)
  on conflict (idempotency_key) do nothing
  returning id into new_id;
  if new_id is null then
    select id into new_id from ops.job_queue where idempotency_key = p_idempotency_key;
  end if;
  return new_id;
end $$;

-- Claims up to p_limit due jobs of one kind. `for update skip locked` lets any
-- number of workers claim concurrently without blocking or double-claiming.
-- A running job whose lease (p_lease) expired is claimable again, unless it
-- was on its last attempt, in which case it is dead-lettered.
create function ops.claim(
  p_kind text, p_limit int, p_worker text, p_lease interval default interval '5 minutes'
) returns setof ops.job_queue
language plpgsql set search_path = ops, pg_temp as $$
begin
  update ops.job_queue q
     set status = 'dead', last_error = coalesce(q.last_error, 'lease expired on last attempt'),
         locked_at = null, locked_by = null, finished_at = now(), updated_at = now()
   where q.id in (
     select s.id from ops.job_queue s
      where s.kind = p_kind and s.status = 'running'
        and s.locked_at < now() - p_lease and s.attempts >= s.max_attempts
      for update skip locked);

  return query
  update ops.job_queue q
     set status = 'running', attempts = q.attempts + 1,
         locked_at = now(), locked_by = p_worker, updated_at = now()
   where q.id in (
     select s.id from ops.job_queue s
      where s.kind = p_kind and s.run_at <= now()
        and (s.status = 'queued'
             or (s.status = 'running' and s.locked_at < now() - p_lease))
      order by s.run_at, s.id
      limit greatest(p_limit, 0)
      for update skip locked)
  returning q.*;
end $$;

create function ops.complete(p_id bigint) returns void
language sql set search_path = ops, pg_temp as $$
  update ops.job_queue
     set status = 'done', locked_at = null, locked_by = null,
         finished_at = now(), updated_at = now()
   where id = p_id and status = 'running';
$$;

-- Failure: retry after 1m * 2^(attempts-1), capped at 1h; dead after max_attempts.
create function ops.fail(p_id bigint, p_error text) returns void
language sql set search_path = ops, pg_temp as $$
  update ops.job_queue
     set status     = case when attempts >= max_attempts then 'dead'::ops.job_status
                           else 'queued'::ops.job_status end,
         run_at     = case when attempts >= max_attempts then run_at
                           else now() + least(interval '1 minute' * power(2, greatest(attempts - 1, 0)),
                                              interval '1 hour') end,
         finished_at = case when attempts >= max_attempts then now() end,
         last_error = left(p_error, 2000),
         locked_at = null, locked_by = null, updated_at = now()
   where id = p_id and status = 'running';
$$;

-- Not a failure: run later (e.g. quiet hours). The attempt is refunded.
create function ops.defer(p_id bigint, p_until timestamptz) returns void
language sql set search_path = ops, pg_temp as $$
  update ops.job_queue
     set status = 'queued', run_at = p_until, attempts = greatest(attempts - 1, 0),
         locked_at = null, locked_by = null, updated_at = now()
   where id = p_id and status = 'running';
$$;

-- ---------------------------------------------------------------- run log
create function ops.start_run(p_job_name text) returns bigint
language sql set search_path = ops, pg_temp as $$
  insert into ops.job_runs (job_name) values (p_job_name) returning id;
$$;

create function ops.finish_run(p_id bigint, p_outcome text, p_detail jsonb default '{}'::jsonb)
returns void
language sql set search_path = ops, pg_temp as $$
  update ops.job_runs
     set finished_at = clock_timestamp(),
         duration_ms = (extract(epoch from clock_timestamp() - started_at) * 1000)::int,
         outcome = p_outcome::ops.run_outcome,
         detail = coalesce(p_detail, '{}'::jsonb)
   where id = p_id;
$$;

-- ---------------------------------------------------------------- pg_cron -> Edge Function
-- Fire-and-forget POST to a function with the service-role key from Vault.
-- Missing secrets are logged as a skipped run, not an error spiral.
create function ops.invoke_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = ops, pg_temp as $$
declare
  base text;
  key  text;
  run  bigint := ops.start_run('invoke:' || p_name);
  req  bigint;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into key  from vault.decrypted_secrets where name = 'service_role_key';
  if base is null or key is null then
    perform ops.finish_run(run, 'skipped', jsonb_build_object('reason', 'vault secrets project_url / service_role_key not set'));
    return null;
  end if;
  select net.http_post(
    url := rtrim(base, '/') || '/functions/v1/' || p_name,
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key),
    timeout_milliseconds := 55000
  ) into req;
  perform ops.finish_run(run, 'ok', jsonb_build_object('net_request_id', req));
  return req;
end $$;

revoke all on all tables in schema ops from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;
revoke execute on all functions in schema ops from public, anon, authenticated;

-- ============================================================================
-- users.timezone — IANA name, captured from the device at signup, editable by
-- the user. Never inferred from IP. Invalid values are refused on write; at
-- signup an invalid or missing value falls back to 'UTC' so signup never fails
-- over a timezone.
-- ============================================================================
create function public.is_valid_timezone(tz text) returns boolean
language sql stable set search_path = pg_catalog as $$
  select tz is not null and exists (select 1 from pg_timezone_names where name = tz);
$$;

alter table public.users add column timezone text not null default 'UTC';

create function public.users_check_timezone() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid_timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

create trigger users_check_timezone
  before insert or update of timezone on public.users
  for each row execute function public.users_check_timezone();

grant update (timezone) on public.users to authenticated;

-- Signup trigger (was migration 004): unchanged age gate, plus timezone.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dob_text text := nullif(btrim(coalesce(new.raw_user_meta_data->>'date_of_birth', '')), '');
  tz_text  text := nullif(btrim(coalesce(new.raw_user_meta_data->>'timezone', '')), '');
  dob date;
begin
  if dob_text is not null then
    begin
      dob := dob_text::date;
    exception when others then
      raise exception 'invalid_date_of_birth: %', dob_text using errcode = '22007';
    end;
    if dob > current_date then
      raise exception 'invalid_date_of_birth: %', dob_text using errcode = '22007';
    end if;
    if dob > (current_date - interval '13 years')::date then
      raise exception 'under_minimum_age' using errcode = 'P0001';
    end if;
  end if;
  if not public.is_valid_timezone(tz_text) then
    tz_text := 'UTC';
  end if;
  insert into public.users (id, email, phone, date_of_birth, timezone)
  values (new.id, new.email, new.phone, dob, tz_text);
  return new;
end $$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.users_check_timezone() from public, anon, authenticated;
