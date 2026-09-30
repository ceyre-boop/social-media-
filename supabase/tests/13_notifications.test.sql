-- Migration 013: push notification infrastructure — devices, preferences with
-- defaults, quiet hours, notify() outbox, receipts, cron wiring.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

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

create function pg_temp.read(q text) returns text language plpgsql as $f$
declare out text;
begin
  execute format('select coalesce(string_agg(t::text, '';''), ''<no rows>'') from (%s) t', q) into out;
  return out;
exception when others then
  return sqlstate;
end $f$;

-- alice / bob come from seed.sql.

-- ------------------------------------------------------------------ preference defaults
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'moment_prompt'),   true,  'moment_prompt defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'friend_request'),  true,  'friend_request defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'friend_accepted'), true,  'friend_accepted defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'followed_live'),   true,  'followed_live defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'comment'),         true,  'comment defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'gift_received'),   true,  'gift_received defaults on');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'like'),            false, 'like defaults OFF');
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'support_reply'),   true,  'support_reply defaults on');
select is((select count(*)::int from public.notification_prefs where user_id = '11111111-1111-4111-8111-111111111111'::uuid), 0,
          'defaults need no stored rows (a missing row means the default)');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.read($$select count(*) from public.my_notification_prefs()$$), '(8)',
          'my_notification_prefs lists all 8 types');
select is(pg_temp.read($$select enabled, is_default from public.my_notification_prefs() where type = 'like'$$),
          '(f,t)', 'like shows as off, by default');
select is(pg_temp.probe($$insert into public.notification_prefs (user_id, type, enabled) values ('11111111-1111-4111-8111-111111111111', 'like', true)$$),
          'ok:1', 'a user can turn a type on');
insert into public.notification_prefs (user_id, type, enabled) values ('11111111-1111-4111-8111-111111111111'::uuid, 'comment', false);
select is(pg_temp.probe($$update public.notification_prefs set enabled = true where user_id = '11111111-1111-4111-8111-111111111111' and type = 'comment'$$),
          'ok:1', 'a user can change their own preference');
select is(pg_temp.probe($$insert into public.notification_prefs (user_id, type, enabled) values ('22222222-2222-4222-8222-222222222222', 'comment', false)$$),
          '42501', 'a user cannot write someone else''s preferences');
reset role;
select is(ops.notification_enabled('11111111-1111-4111-8111-111111111111'::uuid, 'comment'), false, 'a stored row overrides the default (off)');
select is(ops.notification_enabled('22222222-2222-4222-8222-222222222222'::uuid, 'comment'), true, 'another user keeps the default');
insert into public.notification_prefs (user_id, type, enabled) values ('22222222-2222-4222-8222-222222222222'::uuid, 'like', true);
select is(ops.notification_enabled('22222222-2222-4222-8222-222222222222'::uuid, 'like'), true, 'a stored row overrides the default (on)');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.read($$select user_id from public.notification_prefs where user_id = '22222222-2222-4222-8222-222222222222'$$),
          '<no rows>', 'a user cannot read someone else''s preferences');
select is(pg_temp.probe($$select ops.notification_enabled('22222222-2222-4222-8222-222222222222', 'like')$$),
          '42501', 'clients cannot call ops helpers');
reset role;

-- ------------------------------------------------------------------ quiet hours
select is((select (quiet_start, quiet_end)::text from public.users where id = '11111111-1111-4111-8111-111111111111'::uuid),
          '(22:00:00,08:00:00)', 'quiet hours default to 22:00-08:00');

update public.users set timezone = 'America/New_York' where id = '11111111-1111-4111-8111-111111111111'::uuid;   -- EDT = UTC-4 in July
update public.users set timezone = 'Asia/Tokyo'       where id = '22222222-2222-4222-8222-222222222222'::uuid;     -- UTC+9
select is(ops.in_quiet_hours('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 03:30:00+00'), true,  'NY 23:30 is quiet');
select is(ops.in_quiet_hours('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 07:30:00+00'), true,  'NY 03:30 (after midnight) is quiet');
select is(ops.in_quiet_hours('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 12:00:00+00'), false, 'NY 08:00 is not quiet (end is exclusive)');
select is(ops.in_quiet_hours('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 01:59:00+00'), false, 'NY 21:59 is not quiet');
select is(ops.in_quiet_hours('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 02:00:00+00'), true,  'NY 22:00 is quiet (start is inclusive)');
select is(ops.in_quiet_hours('22222222-2222-4222-8222-222222222222'::uuid,   '2026-07-01 03:30:00+00'), false, 'the same instant is 12:30 in Tokyo: not quiet');
select is(ops.in_quiet_hours('22222222-2222-4222-8222-222222222222'::uuid,   '2026-07-01 14:00:00+00'), true,  'Tokyo 23:00 is quiet');

select is(ops.quiet_hours_end('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 03:30:00+00'), '2026-07-01 12:00:00+00'::timestamptz,
          'quiet hours starting before midnight end at 08:00 local the next day');
select is(ops.quiet_hours_end('11111111-1111-4111-8111-111111111111'::uuid, '2026-07-01 07:30:00+00'), '2026-07-01 12:00:00+00'::timestamptz,
          'after midnight they end at 08:00 local the same day');

update public.users set quiet_start = '13:00', quiet_end = '15:00' where id = '22222222-2222-4222-8222-222222222222'::uuid;  -- no wrap
select is(ops.in_quiet_hours('22222222-2222-4222-8222-222222222222'::uuid, '2026-07-01 05:00:00+00'), true,  'a daytime window (14:00 Tokyo) is quiet');
select is(ops.in_quiet_hours('22222222-2222-4222-8222-222222222222'::uuid, '2026-07-01 07:00:00+00'), false, 'and 16:00 Tokyo is not');
select is(ops.quiet_hours_end('22222222-2222-4222-8222-222222222222'::uuid, '2026-07-01 05:00:00+00'), '2026-07-01 06:00:00+00'::timestamptz,
          'a daytime window ends at its end time');
update public.users set quiet_start = '09:00', quiet_end = '09:00' where id = '22222222-2222-4222-8222-222222222222'::uuid;
select is(ops.in_quiet_hours('22222222-2222-4222-8222-222222222222'::uuid, '2026-07-01 00:00:00+00'), false, 'equal start and end means no quiet hours');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.probe($$update public.users set quiet_start = '23:00', quiet_end = '07:00' where id = '11111111-1111-4111-8111-111111111111'$$),
          'ok:1', 'a user can set their own quiet hours');
reset role;

-- ------------------------------------------------------------------ devices
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.probe($$select public.register_push_token('ExponentPushToken[aaa]', 'ios')$$), 'ok:1',
          'a user registers a push token');
select public.register_push_token('ExponentPushToken[aaa]', 'ios');
select is(pg_temp.read($$select platform, token_kind, invalidated_at is null, failure_count from public.devices$$),
          '(ios,expo,t,0)', 'the device row is visible to its owner');
select is(pg_temp.probe($$select public.register_push_token('not-a-token', 'ios')$$), '22023',
          'a malformed token is refused');
select is(pg_temp.probe($$update public.devices set failure_count = 0$$), '42501',
          'clients cannot write failure_count');
select is(pg_temp.probe($$update public.devices set invalidated_at = now() where push_token = 'ExponentPushToken[aaa]'$$), 'ok:1',
          'a user can invalidate their own token (sign-out)');
reset role;

-- the same physical device signs in as bob: the token moves to bob
select pg_temp.act_as('22222222-2222-4222-8222-222222222222'::uuid);
set local role authenticated;
select public.register_push_token('ExponentPushToken[aaa]', 'ios');
select is(pg_temp.read($$select count(*) from public.devices$$), '(1)', 'bob now owns the token');
reset role;
select is((select user_id::text from public.devices where push_token = 'ExponentPushToken[aaa]'),
          '22222222-2222-4222-8222-222222222222', 'the token is never registered to two users');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.read($$select count(*) from public.devices$$), '(0)', 'alice no longer sees it');
reset role;

-- ------------------------------------------------------------------ notify(): inbox + push outbox, idempotent
select ops.notify('11111111-1111-4111-8111-111111111111'::uuid, 'comment', 'comment:1', '{"actor_name":"Bob"}');
select ops.notify('11111111-1111-4111-8111-111111111111'::uuid, 'comment', 'comment:1', '{"actor_name":"Bob"}');
select is((select count(*)::int from ops.job_queue where kind = 'push'
             and payload->>'user_id' = '11111111-1111-4111-8111-111111111111'), 1,
          'notifying twice for the same (user, type, ref) enqueues one push');
select is((select count(*)::int from public.notifications where user_id = '11111111-1111-4111-8111-111111111111'::uuid and kind = 'comment'), 1,
          'and writes one in-app notification');
select ops.notify('11111111-1111-4111-8111-111111111111'::uuid, 'comment', 'comment:2', '{}');
select is((select count(*)::int from ops.job_queue where kind = 'push'
             and payload->>'user_id' = '11111111-1111-4111-8111-111111111111'), 2,
          'a different ref is a different push');

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'::uuid);
set local role authenticated;
select is(pg_temp.probe($$update public.notifications set read_at = now() where user_id = '11111111-1111-4111-8111-111111111111'$$),
          'ok:2', 'a user can mark their notifications read');
select is(pg_temp.probe($$update public.notifications set kind = 'like'$$), '42501',
          'clients cannot rewrite a notification');
select is(pg_temp.probe($$insert into public.notifications (user_id, kind) values ('11111111-1111-4111-8111-111111111111', 'like')$$),
          '42501', 'clients cannot fabricate notifications');
select is(pg_temp.probe($$select * from ops.push_receipts$$), '42501', 'clients cannot read push receipts');
reset role;

select throws_ok($$select ops.notify('11111111-1111-4111-8111-111111111111', 'comment', 'bad', '"a string"'::jsonb)$$,
          '22023', null, 'notify refuses data that is not a JSON object');

-- ------------------------------------------------------------------ delivery failures
insert into public.devices (user_id, platform, push_token)
values ('11111111-1111-4111-8111-111111111111'::uuid, 'ios', 'ExponentPushToken[f1]');
select ops.device_failed((select id from public.devices where push_token = 'ExponentPushToken[f1]'), false);
select is((select (failure_count, invalidated_at is null)::text from public.devices where push_token = 'ExponentPushToken[f1]'),
          '(1,t)', 'a transient delivery error counts but keeps the token');
select ops.device_failed((select id from public.devices where push_token = 'ExponentPushToken[f1]'), true);
select is((select (failure_count, invalidated_at is null)::text from public.devices where push_token = 'ExponentPushToken[f1]'),
          '(2,f)', 'DeviceNotRegistered invalidates the token');

-- ------------------------------------------------------------------ cleanup
insert into public.devices (user_id, platform, push_token, invalidated_at)
values ('11111111-1111-4111-8111-111111111111'::uuid, 'android', 'ExponentPushToken[dead]', now() - interval '1 day'),
       ('11111111-1111-4111-8111-111111111111'::uuid, 'android', 'ExponentPushToken[live]', null);
insert into public.devices (user_id, platform, push_token, last_seen_at)
values ('11111111-1111-4111-8111-111111111111'::uuid, 'android', 'ExponentPushToken[stale]', now() - interval '300 days');
select ops.cleanup_push_tokens();
select is((select array_agg(push_token order by push_token) from public.devices where user_id = '11111111-1111-4111-8111-111111111111'::uuid),
          array['ExponentPushToken[live]'], 'cleanup prunes invalidated and stale tokens, keeps live ones');

-- ------------------------------------------------------------------ cron wiring
select is((select array_agg(jobname order by jobname) from cron.job
            where jobname in ('push-dispatch', 'push-receipts', 'token-cleanup')),
          array['push-dispatch', 'push-receipts', 'token-cleanup'], 'the three push jobs are scheduled');
select is((select schedule from cron.job where jobname = 'push-dispatch'), '* * * * *', 'dispatch runs every minute');
select is((select schedule from cron.job where jobname = 'push-receipts'), '*/15 * * * *', 'receipts every 15 minutes');

select * from finish();
rollback;
