-- Migration 021: content_filter — event log (body only for RED), RED review
-- queue with a 24h due_by, 30-day retention, per-stream chat strictness,
-- Trusted Circles. No client access to any ops table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

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

-- alice (adult, verified), bob (adult), minnie (15) come from seed.sql.
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''

-- ------------------------------------------------------------------ schema
select has_table('ops', 'content_filter_events', 'ops.content_filter_events exists');
select has_table('ops', 'content_filter_review_queue', 'ops.content_filter_review_queue exists');
select has_column('public', 'live_streams', 'room_level', 'live_streams.room_level exists');
select has_table('public', 'trusted_circle_members', 'public.trusted_circle_members exists');
select ok(exists(select 1 from cron.job where jobname = 'content-filter-purge'), 'retention purge is scheduled');

-- ------------------------------------------------------------------ no client access to ops
set local role anon;
select is(pg_temp.probe($$select 1 from ops.content_filter_events$$), '42501', 'anon cannot read events');
reset role;
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$select 1 from ops.content_filter_events$$), '42501', 'authenticated cannot read events');
select is(pg_temp.probe($$select 1 from ops.content_filter_review_queue$$), '42501', 'authenticated cannot read the review queue');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms) values ('dm', %L, 'YELLOW', 'YELLOW', 5)$$, :alice)),
          '42501', 'authenticated cannot write events');
select is(pg_temp.probe($$select ops.content_filter_purge()$$), '42501', 'authenticated cannot run the purge');
reset role;
select ok(not has_schema_privilege('authenticated', 'ops', 'usage') and not has_schema_privilege('anon', 'ops', 'usage'),
          'the ops schema is not usable by API roles (writes come only from the Edge Function)');

-- ------------------------------------------------------------------ body only for RED; never GREEN
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms, body) values ('dm', %L, 'YELLOW', 'YELLOW', 5, 'hi')$$, :alice)),
          '23514', 'a YELLOW event cannot store the message body');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms, body) values ('dm', %L, 'ORANGE', 'ORANGE', 5, 'hi')$$, :alice)),
          '23514', 'an ORANGE event cannot store the message body');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms) values ('dm', %L, 'RED', 'RED', 5)$$, :alice)),
          '23514', 'a RED event must store the body for human review');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms) values ('dm', %L, 'GREEN', 'GREEN', 5)$$, :alice)),
          '23514', 'GREEN is never logged');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms, yellow_overridden_at) values ('dm', %L, 'ORANGE', 'ORANGE', 5, now())$$, :alice)),
          '23514', 'only a YELLOW can be overridden');
select is(pg_temp.probe(format($$insert into ops.content_filter_events (surface, sender_id, tier, raw_tier, latency_ms) values ('sms', %L, 'YELLOW', 'YELLOW', 5)$$, :alice)),
          '23514', 'surface is one of live_chat / dm / comment');

-- ------------------------------------------------------------------ RED -> review queue due in 24h
insert into ops.content_filter_events (id, surface, sender_id, tier, raw_tier, reason_codes, policy_refs, latency_ms, body, created_at)
values ('cf000000-0000-4000-8000-000000000001', 'dm', :alice, 'RED', 'RED', '{self_harm_encouragement}', '{red.self_harm_encouragement}', 7, 'kys', '2026-09-30 12:00:00+00');
insert into ops.content_filter_events (id, surface, sender_id, tier, raw_tier, reason_codes, policy_refs, latency_ms)
values ('cf000000-0000-4000-8000-000000000002', 'live_chat', :bob, 'YELLOW', 'YELLOW', '{insult_at_person}', '{yellow.insult}', 3);

select is((select count(*)::int from ops.content_filter_review_queue where event_id = 'cf000000-0000-4000-8000-000000000001'), 1,
          'a RED event is queued for human review');
select is((select due_by from ops.content_filter_review_queue where event_id = 'cf000000-0000-4000-8000-000000000001'),
          '2026-10-01 12:00:00+00'::timestamptz, 'review due_by is exactly created_at + 24h');
select is((select status from ops.content_filter_review_queue where event_id = 'cf000000-0000-4000-8000-000000000001'), 'open',
          'the review starts open');
select is((select count(*)::int from ops.content_filter_review_queue where event_id = 'cf000000-0000-4000-8000-000000000002'), 0,
          'a YELLOW event is not queued');
select is(pg_temp.probe($$update ops.content_filter_review_queue set status = 'resolved' where event_id = 'cf000000-0000-4000-8000-000000000001'$$),
          '23514', 'resolving a review requires resolved_at');
select is(pg_temp.probe($$delete from ops.content_filter_events where id = 'cf000000-0000-4000-8000-000000000001'$$),
          '23503', 'a queued RED event cannot be deleted out from under its review');

-- ------------------------------------------------------------------ retention: 30 days for YELLOW/ORANGE, RED kept
insert into ops.content_filter_events (id, surface, sender_id, tier, raw_tier, latency_ms, created_at) values
  ('cf000000-0000-4000-8000-000000000003', 'dm', :bob, 'YELLOW', 'YELLOW', 3, now() - interval '31 days'),
  ('cf000000-0000-4000-8000-000000000004', 'dm', :bob, 'ORANGE', 'ORANGE', 3, now() - interval '31 days'),
  ('cf000000-0000-4000-8000-000000000005', 'dm', :bob, 'YELLOW', 'YELLOW', 3, now() - interval '29 days');
insert into ops.content_filter_events (id, surface, sender_id, tier, raw_tier, latency_ms, body, created_at) values
  ('cf000000-0000-4000-8000-000000000006', 'dm', :bob, 'RED', 'RED', 3, 'x', now() - interval '90 days');
select ok(ops.content_filter_purge() >= 2, 'purge deletes expired YELLOW and ORANGE rows');
select is((select count(*)::int from ops.content_filter_events where id in ('cf000000-0000-4000-8000-000000000003', 'cf000000-0000-4000-8000-000000000004')), 0,
          'YELLOW and ORANGE older than 30 days are gone');
select is((select count(*)::int from ops.content_filter_events where id = 'cf000000-0000-4000-8000-000000000005'), 1,
          'a 29-day-old YELLOW is kept');
select is((select count(*)::int from ops.content_filter_events where id = 'cf000000-0000-4000-8000-000000000006'), 1,
          'RED is never purged');

-- ------------------------------------------------------------------ chat strictness
insert into public.live_streams (id, host_id, provider) values ('cf000000-0000-4000-8000-0000000000aa', :alice, 'test');
select is((select room_level::text from public.live_streams where id = 'cf000000-0000-4000-8000-0000000000aa'), 'standard',
          'streams default to standard strictness');
set local role authenticated;
select pg_temp.act_as(:alice);
update public.live_streams set room_level = 'family' where id = 'cf000000-0000-4000-8000-0000000000aa';
select is((select room_level::text from public.live_streams where id = 'cf000000-0000-4000-8000-0000000000aa'), 'family',
          'the host can set their stream''s strictness');
select pg_temp.act_as(:bob);
select is(pg_temp.probe($$update public.live_streams set room_level = 'open' where id = 'cf000000-0000-4000-8000-0000000000aa'$$),
          'ok:0', 'another user cannot change it');
reset role;
select is((select room_level::text from public.live_streams where id = 'cf000000-0000-4000-8000-0000000000aa'), 'family',
          'strictness is what the host set');

-- ------------------------------------------------------------------ Trusted Circles
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe(format($$insert into public.trusted_circle_members (creator_id, member_id) values (%L, %L)$$, :alice, :bob)),
          'ok:1', 'a creator can add a regular to their Trusted Circle');
select is(pg_temp.probe(format($$insert into public.trusted_circle_members (creator_id, member_id) values (%L, %L)$$, :alice, :alice)),
          '23514', 'a creator cannot add themselves');
select pg_temp.act_as(:bob);
select is(pg_temp.probe(format($$insert into public.trusted_circle_members (creator_id, member_id) values (%L, %L)$$, :alice, :bob)),
          '42501', 'nobody can write into someone else''s circle');
select is(pg_temp.probe($$select 1 from public.trusted_circle_members$$), 'ok:0',
          'a member cannot read the creator''s circle');
reset role;

select * from finish();
rollback;
