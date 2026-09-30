-- Migration 012: scheduled-job infrastructure (ops.job_queue / ops.job_runs),
-- pg_cron + pg_net, and users.timezone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs one statement as the current role and rolls it back; returns
-- 'ok:<rows>' or '<sqlstate>'.
create function pg_temp.probe(stmt text) returns text language plpgsql as $f$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    raise exception using errcode = 'PX999', message = 'ok:' || n;
  exception when others then
    if sqlstate = 'PX999' then return sqlerrm; end if;
    return sqlstate;
  end;
end $f$;

-- ------------------------------------------------------------------ extensions
select ok(exists(select 1 from pg_extension where extname = 'pg_cron'), 'pg_cron is installed');
select ok(exists(select 1 from pg_extension where extname = 'pg_net'), 'pg_net is installed');

-- ------------------------------------------------------------------ enqueue is idempotent
select ok(ops.enqueue('test_a', '{"n":1}', now(), 'k-1') is not null, 'enqueue returns the job id');
select is(ops.enqueue('test_a', '{"n":2}', now(), 'k-1'),
          (select id from ops.job_queue where idempotency_key = 'k-1'),
          'enqueue with the same key returns the existing job');
select is((select count(*)::int from ops.job_queue where idempotency_key = 'k-1'), 1,
          'enqueueing the same key twice stores one job');
select is((select payload->>'n' from ops.job_queue where idempotency_key = 'k-1'), '1',
          'the second enqueue does not overwrite the first payload');
select throws_ok($$select ops.enqueue('test_a', '{}', now(), null)$$, '23502', null,
          'a job without an idempotency key is refused');

-- ------------------------------------------------------------------ claim
select ops.enqueue('test_b', '{}', now() - interval '2 minutes', 'b-1');
select ops.enqueue('test_b', '{}', now() - interval '1 minute', 'b-2');
select ops.enqueue('test_b', '{}', now() + interval '1 hour', 'b-future');

select is((select array_agg(idempotency_key order by run_at) from ops.claim('test_b', 10, 'w1')),
          array['b-1','b-2'], 'claim returns only due jobs, oldest first');
select is((select status::text from ops.job_queue where idempotency_key = 'b-1'), 'running',
          'a claimed job is running');
select is((select attempts from ops.job_queue where idempotency_key = 'b-1'), 1,
          'claiming counts an attempt');
select is((select locked_by from ops.job_queue where idempotency_key = 'b-1'), 'w1',
          'a claimed job records its worker');
select is((select count(*)::int from ops.claim('test_b', 10, 'w2')), 0,
          'a running job with a live lease is not claimed again');

update ops.job_queue set locked_at = now() - interval '10 minutes' where idempotency_key = 'b-2';
select is((select array_agg(idempotency_key) from ops.claim('test_b', 10, 'w2')), array['b-2'],
          'a job whose lease expired (worker died) is claimed again');
select is((select attempts from ops.job_queue where idempotency_key = 'b-2'), 2,
          'reclaiming an expired lease counts another attempt');

select ops.enqueue('test_c', '{}', now(), 'c-' || g) from generate_series(1, 5) g;
select is((select count(*)::int from ops.claim('test_c', 2, 'w1')), 2, 'claim honours the limit');
select is((select count(*)::int from ops.claim('test_c', 10, 'w1')), 3, 'the rest are claimable');

-- ------------------------------------------------------------------ claim concurrency (skip locked)
-- A second connection (dblink) inserts committed jobs and holds a claim open
-- in its own transaction; this session must skip those rows, not block.
create extension if not exists dblink with schema extensions;
-- Over the docker network address (password auth): loopback is trust-only,
-- which dblink refuses for a non-superuser. Local stack credentials.
select extensions.dblink_connect('other', format(
  'host=%s port=5432 dbname=postgres user=postgres password=postgres',
  coalesce(host(inet_server_addr()), '127.0.0.1')));
select extensions.dblink_exec('other', $$delete from ops.job_queue where kind = 'test_conc'$$);
select extensions.dblink_exec('other',
  $x$do $d$ begin
       perform ops.enqueue('test_conc', '{}', now() - interval '1 minute', 'conc-' || g)
       from generate_series(1, 5) g;
     end $d$$x$);
select extensions.dblink_exec('other', 'begin');
select is((select n from extensions.dblink('other',
            $$select count(*)::int from ops.claim('test_conc', 2, 'other')$$) as t(n int)), 2,
          'the other session claims 2 jobs and keeps its transaction open');

create function pg_temp.claim_count_and_rollback(k text) returns int language plpgsql as $f$
declare n int;
begin
  begin
    set local lock_timeout = '2s';
    select count(*) into n from ops.claim(k, 10, 'me');
    raise exception using errcode = 'PX999', message = n::text;
  exception when others then
    if sqlstate = 'PX999' then return sqlerrm::int; end if;
    raise;
  end;
end $f$;
select is(pg_temp.claim_count_and_rollback('test_conc'), 3,
          'a concurrent claim skips the 2 locked jobs and takes the other 3 without waiting');
select extensions.dblink_exec('other', 'rollback');
select is(pg_temp.claim_count_and_rollback('test_conc'), 5,
          'once the other session rolls back, all 5 are claimable');
select extensions.dblink_exec('other', $$delete from ops.job_queue where kind = 'test_conc'$$);
select extensions.dblink_disconnect('other');

-- ------------------------------------------------------------------ complete
select ops.enqueue('test_d', '{}', now(), 'd-1');
select ops.claim('test_d', 1, 'w1');
select ops.complete((select id from ops.job_queue where idempotency_key = 'd-1'));
select is((select status::text from ops.job_queue where idempotency_key = 'd-1'), 'done', 'complete marks done');
select ok((select finished_at is not null and locked_at is null from ops.job_queue where idempotency_key = 'd-1'),
          'complete stamps finished_at and releases the lease');
select is(ops.enqueue('test_d', '{}', now(), 'd-1'), (select id from ops.job_queue where idempotency_key = 'd-1'),
          'a finished job''s key still dedupes (running twice never double-sends)');
select is((select status::text from ops.job_queue where idempotency_key = 'd-1'), 'done',
          're-enqueueing a finished job does not requeue it');

-- ------------------------------------------------------------------ backoff + dead letter
select ops.enqueue('test_e', '{}', now(), 'e-1');
create function pg_temp.fail_once() returns interval language plpgsql as $f$
declare j bigint := (select id from ops.job_queue where idempotency_key = 'e-1');
begin
  update ops.job_queue set run_at = now() where id = j and status = 'queued';
  perform ops.claim('test_e', 1, 'w1');
  perform ops.fail(j, 'boom');
  return (select run_at - now() from ops.job_queue where id = j);
end $f$;

select is(pg_temp.fail_once(), interval '1 minute', 'first failure retries after 1 minute');
select is((select status::text from ops.job_queue where idempotency_key = 'e-1'), 'queued', 'a failed job is requeued');
select is((select last_error from ops.job_queue where idempotency_key = 'e-1'), 'boom', 'the error is recorded');
select is(pg_temp.fail_once(), interval '2 minutes', 'second failure retries after 2 minutes');
select is(pg_temp.fail_once(), interval '4 minutes', 'third failure retries after 4 minutes');
select is(pg_temp.fail_once(), interval '8 minutes', 'fourth failure retries after 8 minutes');
select pg_temp.fail_once();
select is((select status::text from ops.job_queue where idempotency_key = 'e-1'), 'dead',
          'the fifth failure (max_attempts 5) dead-letters the job');
select is((select count(*)::int from ops.claim('test_e', 10, 'w1')), 0, 'a dead job is never claimed');

select ops.enqueue('test_f', '{}', now(), 'f-1', 20);
update ops.job_queue set attempts = 12 where idempotency_key = 'f-1';
select ops.claim('test_f', 1, 'w1');
select ops.fail((select id from ops.job_queue where idempotency_key = 'f-1'), 'boom');
select is((select run_at - now() from ops.job_queue where idempotency_key = 'f-1'), interval '1 hour',
          'backoff is capped at 1 hour');

select ops.enqueue('test_g', '{}', now(), 'g-1', 1);
select ops.claim('test_g', 1, 'w1');
update ops.job_queue set locked_at = now() - interval '10 minutes' where idempotency_key = 'g-1';
select is((select count(*)::int from ops.claim('test_g', 10, 'w2')), 0,
          'an expired lease on the last attempt is not retried');
select is((select status::text from ops.job_queue where idempotency_key = 'g-1'), 'dead',
          'it is dead-lettered instead');

-- defer: moves a job later without spending an attempt (quiet hours)
select ops.enqueue('test_h', '{}', now(), 'h-1');
select ops.claim('test_h', 1, 'w1');
select ops.defer((select id from ops.job_queue where idempotency_key = 'h-1'), now() + interval '3 hours');
select is((select (status::text, attempts, run_at - now())::text from ops.job_queue where idempotency_key = 'h-1'),
          '(queued,0,03:00:00)', 'defer requeues at the given time and refunds the attempt');

-- ------------------------------------------------------------------ run log
select ops.finish_run(ops.start_run('nightly_thing'), 'ok', '{"sent":3}');
select is((select (outcome::text, detail->>'sent') from ops.job_runs where job_name = 'nightly_thing')::text,
          '(ok,3)', 'the run log records outcome and detail');
select ok((select finished_at is not null and duration_ms >= 0 from ops.job_runs where job_name = 'nightly_thing'),
          'the run log records timing');
select throws_ok($$select ops.finish_run(ops.start_run('x'), 'meh', '{}')$$, '22P02', null,
          'outcome must be ok, error or skipped');

-- ------------------------------------------------------------------ no client access
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(pg_temp.probe($$select * from ops.job_queue$$), '42501', 'clients cannot read the job queue');
select is(pg_temp.probe($$select ops.enqueue('x', '{}', now(), 'evil')$$), '42501', 'clients cannot enqueue');
select is(pg_temp.probe($$select * from ops.job_runs$$), '42501', 'clients cannot read the run log');
reset role;
set local role anon;
select is(pg_temp.probe($$select ops.claim('x', 1, 'evil')$$), '42501', 'anon cannot claim');
reset role;

-- ------------------------------------------------------------------ users.timezone
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'tz1@example.com', '{"date_of_birth":"1990-01-01","timezone":"America/Los_Angeles"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'tz2@example.com', '{"date_of_birth":"1990-01-01","timezone":"Mars/Olympus_Mons"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'tz3@example.com', '{"date_of_birth":"1990-01-01"}');
select is((select timezone from public.users where id = 'a0000000-0000-4000-8000-000000000001'),
          'America/Los_Angeles', 'signup stores the device timezone');
select is((select timezone from public.users where id = 'a0000000-0000-4000-8000-000000000002'),
          'UTC', 'an invalid timezone at signup falls back to UTC (signup still succeeds)');
select is((select timezone from public.users where id = 'a0000000-0000-4000-8000-000000000003'),
          'UTC', 'a missing timezone defaults to UTC');

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(pg_temp.probe($$update public.users set timezone = 'Europe/Berlin' where id = 'a0000000-0000-4000-8000-000000000001'$$),
          'ok:1', 'a user can change their own timezone');
select is(pg_temp.probe($$update public.users set timezone = 'Not/AZone' where id = 'a0000000-0000-4000-8000-000000000001'$$),
          '22023', 'an invalid timezone is rejected');
select is(pg_temp.probe($$update public.users set timezone = 'Europe/Berlin' where id = 'a0000000-0000-4000-8000-000000000002'$$),
          'ok:0', 'a user cannot change someone else''s timezone');
reset role;

select * from finish();
rollback;
