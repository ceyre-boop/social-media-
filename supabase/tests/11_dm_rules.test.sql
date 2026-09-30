-- Migration 010: DM initiation rules, request-acceptance opacity, minor-thread
-- limits, media immutability, no TRUNCATE for clients.
begin;
create extension if not exists pgtap with schema extensions;
select plan(85);

-- ------------------------------------------------------------------ helpers
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Runs statements as the current role, then rolls them back. Returns
-- 'ok:<rows affected by the last statement>' or '<sqlstate>:<message>'.
create function pg_temp.probe(stmts text[]) returns text language plpgsql as $f$
declare
  s text;
  n int;
begin
  begin
    foreach s in array stmts loop
      execute s;
      get diagnostics n = row_count;
    end loop;
    raise exception using errcode = 'PX999', message = 'ok:' || n;
  exception when others then
    if sqlstate = 'PX999' then
      return sqlerrm;
    end if;
    return sqlstate || ':' || sqlerrm;
  end;
end $f$;

-- Runs a query as the current role and returns its rows as text (values
-- included, so a leaked column shows up as a difference), or the error.
create function pg_temp.read(q text) returns text language plpgsql as $f$
declare
  out text;
begin
  execute format('select coalesce(string_agg(t::text, '';''), ''<no rows>'') from (%s) t', q) into out;
  return out;
exception when others then
  return sqlstate || ':' || sqlerrm;
end $f$;

-- Everything the SENDER can do or read about one request thread, as text,
-- with the ids replaced by S / R / C / Q so threads can be compared.
create function pg_temp.sender_actions(conv uuid, req uuid, s uuid, r uuid) returns text
language plpgsql as $f$
declare
  out text;
begin
  out := concat_ws(E'\n',
    'send follow-up: ' || pg_temp.probe(array[format(
      'insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)',
      conv, s, 'follow-up')]),
    'edit own message: ' || pg_temp.probe(array[format(
      'update public.messages set body = %L, edited_at = now() where conversation_id = %L and sender_id = %L',
      'edited', conv, s)]),
    'add recipient: ' || pg_temp.probe(array[format(
      'insert into public.conversation_members (conversation_id, user_id) values (%L, %L)', conv, r)]),
    'add recipient, on conflict do nothing: ' || pg_temp.probe(array[format(
      'insert into public.conversation_members (conversation_id, user_id) values (%L, %L) on conflict do nothing',
      conv, r)]),
    'request again, same conversation: ' || pg_temp.probe(array[format(
      'insert into public.message_requests (sender_id, recipient_id, conversation_id) values (%L, %L, %L)',
      s, r, conv)]),
    'request again, no conversation: ' || pg_temp.probe(array[format(
      'insert into public.message_requests (sender_id, recipient_id) values (%L, %L)', s, r)]),
    'accept own request: ' || pg_temp.probe(array[format(
      'update public.message_requests set status = %L where id = %L', 'accepted', req)]),
    'update where status: ' || pg_temp.probe(array[format(
      'update public.message_requests set status = %L where id = %L and status = %L', 'declined', req, 'pending')]),
    'touch recipient member row: ' || pg_temp.probe(array[format(
      'update public.conversation_members set left_at = now() where conversation_id = %L and user_id = %L', conv, r)]),
    'delete recipient member row: ' || pg_temp.probe(array[format(
      'delete from public.conversation_members where conversation_id = %L and user_id = %L', conv, r)]),
    'rename: ' || pg_temp.probe(array[format(
      'update public.conversations set title = %L where id = %L', 'renamed', conv)]),
    'leave and rejoin: ' || pg_temp.probe(array[
      format('update public.conversation_members set left_at = now() where conversation_id = %L and user_id = %L', conv, s),
      format('update public.conversation_members set left_at = null where conversation_id = %L and user_id = %L', conv, s)])
  );
  return replace(replace(replace(replace(out, s::text, 'S'), r::text, 'R'), conv::text, 'C'), req::text, 'Q');
end $f$;

create function pg_temp.sender_view(conv uuid, req uuid, s uuid, r uuid) returns text
language plpgsql as $f$
declare
  out text;
begin
  out := concat_ws(E'\n',
    'conversation: ' || coalesce(
      (select (to_jsonb(c) - 'id' - 'created_at')::text from public.conversations c where c.id = conv), '<none>'),
    'member rows: ' || coalesce(
      (select string_agg(format('%s read=%s muted=%s left=%s', m.user_id, m.last_read_at is not null,
                                m.muted_until is not null, m.left_at is not null), ',' order by m.user_id)
       from public.conversation_members m where m.conversation_id = conv), '<none>'),
    'recipient member state: ' || pg_temp.read((format(
      'select joined_at, last_read_at, muted_until, left_at from public.conversation_members where conversation_id = %L and user_id = %L',
      conv, r))),
    'roster: ' || coalesce(
      (select string_agg(user_id::text, ',' order by (user_id = s) desc)
       from public.conversation_roster where conversation_id = conv), '<none>'),
    'request row: ' || coalesce(
      (select (to_jsonb(q) - 'id' - 'created_at')::text
       from (select id, sender_id, recipient_id, conversation_id, created_at
             from public.message_requests where id = req) q), '<none>'),
    'request status: ' || pg_temp.read(format(
      'select status from public.message_requests where id = %L', req)),
    'request star: ' || pg_temp.read(format(
      'select * from public.message_requests where id = %L', req)),
    'all member rows: ' || pg_temp.read(format(
      'select user_id, joined_at is not null, last_read_at is not null, muted_until is not null, left_at is not null from public.conversation_members where conversation_id = %L order by user_id', conv)),
    'messages: ' || coalesce(
      (select string_agg(sender_id::text || '=' || coalesce(body, ''), ',' order by body)
       from public.messages where conversation_id = conv), '<none>'),
    'inbox rows: ' || (select count(*) from public.message_requests_inbox),
    pg_temp.sender_actions(conv, req, s, r)
  );
  return replace(replace(replace(replace(out, s::text, 'S'), r::text, 'R'), conv::text, 'C'), req::text, 'Q');
end $f$;

-- ------------------------------------------------------------------- users
-- sam, rita, ravi, rosa, ann: adults with no relationships. mia (15) and
-- max (14): minors.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000000a1', 'sam@test.local',  '{"date_of_birth":"1990-01-01"}'),
  ('a0000000-0000-4000-8000-0000000000a2', 'rita@test.local', '{"date_of_birth":"1991-01-01"}'),
  ('a0000000-0000-4000-8000-0000000000a3', 'ravi@test.local', '{"date_of_birth":"1992-01-01"}'),
  ('a0000000-0000-4000-8000-0000000000a4', 'rosa@test.local', '{"date_of_birth":"1993-01-01"}'),
  ('a0000000-0000-4000-8000-0000000000a5', 'ann@test.local',  '{"date_of_birth":"1985-01-01"}'),
  ('a0000000-0000-4000-8000-0000000000b1', 'mia@test.local',
     jsonb_build_object('date_of_birth', (current_date - interval '15 years')::date::text)),
  ('a0000000-0000-4000-8000-0000000000b2', 'max@test.local',
     jsonb_build_object('date_of_birth', (current_date - interval '14 years')::date::text));

-- =========================================================================
-- B. ACCEPTANCE OPACITY
-- sam requests rita (stays pending), ravi (accepts) and rosa (declines), each
-- with a held first message in its own conversation.
-- =========================================================================
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam
insert into public.conversations (id, created_by) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1'),
  ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1'),
  ('c1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a1');
insert into public.conversation_members (conversation_id, user_id) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1'),
  ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1'),
  ('c1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a1');
insert into public.messages (conversation_id, sender_id, body) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'hello from sam'),
  ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'hello from sam'),
  ('c1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a1', 'hello from sam');
select lives_ok(
  $$insert into public.message_requests (id, sender_id, recipient_id, conversation_id) values
      ('d1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
       'a0000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-000000000001'),
      ('d1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1',
       'a0000000-0000-4000-8000-0000000000a3', 'c1000000-0000-4000-8000-000000000002'),
      ('d1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a1',
       'a0000000-0000-4000-8000-0000000000a4', 'c1000000-0000-4000-8000-000000000003')$$,
  'adult → unconnected adult: sam files three message requests (adult → adult allowed)');

-- Baseline snapshot of the pending thread, before anyone answers.
create temp table snap (label text primary key, body text);
grant all on snap to authenticated;
insert into snap values ('baseline', pg_temp.sender_view(
  'c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2'));

-- ------------------------------------------------ recipient, before accept
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a3');  -- ravi
select is(
  (select row(sender_id, status, conversation_id, created_at is not null)::text
   from public.message_requests_inbox where id = 'd1000000-0000-4000-8000-000000000002'),
  row('a0000000-0000-4000-8000-0000000000a1'::uuid, 'pending'::text,
      'c1000000-0000-4000-8000-000000000002'::uuid, true)::text,
  'the recipient sees the request (sender, time, status) in the inbox');
select is((select count(*)::int from public.messages
           where conversation_id = 'c1000000-0000-4000-8000-000000000002'),
  0, 'before accepting, the recipient cannot read the body');
select is((select count(*)::int from public.conversations
           where id = 'c1000000-0000-4000-8000-000000000002'),
  0, 'before accepting, the recipient cannot see the conversation');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a3', 'sneaky')$$,
  'P0001', 'dm_not_allowed', 'before accepting, the recipient cannot write into the thread');

-- ------------------------------------------------ answer the requests
select lives_ok(
  $$update public.message_requests set status = 'accepted' where id = 'd1000000-0000-4000-8000-000000000002'$$,
  'ravi accepts');
select is((select body from public.messages
           where conversation_id = 'c1000000-0000-4000-8000-000000000002'),
  'hello from sam', 'after accepting, the recipient reads the held body');
-- ravi does everything a member does that could leak a read receipt.
update public.conversation_members
   set last_read_at = now(), muted_until = now() + interval '1 day'
 where conversation_id = 'c1000000-0000-4000-8000-000000000002'
   and user_id = 'a0000000-0000-4000-8000-0000000000a3';
select is(
  pg_temp.probe(array[$$update public.conversations set title = 'ravi was here'
                        where id = 'c1000000-0000-4000-8000-000000000002'$$]),
  'ok:0', 'the recipient cannot rename the request thread (would signal acceptance)');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a4');  -- rosa
select lives_ok(
  $$update public.message_requests set status = 'declined' where id = 'd1000000-0000-4000-8000-000000000003'$$,
  'rosa declines');

-- ------------------------------------------------ the sender's view
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam
insert into snap values
  ('pending', pg_temp.sender_view('c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
                                  'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2')),
  ('accepted', pg_temp.sender_view('c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
                                   'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a3')),
  ('declined', pg_temp.sender_view('c1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003',
                                   'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a4'));

select is((select body from snap where label = 'accepted'), (select body from snap where label = 'pending'),
  'OPACITY: everything the sender can read or try is identical for accepted and pending');
select is((select body from snap where label = 'declined'), (select body from snap where label = 'pending'),
  'OPACITY: everything the sender can read or try is identical for declined and pending');
select is((select body from snap where label = 'pending'), (select body from snap where label = 'baseline'),
  'OPACITY: nothing the recipients did changed the sender''s view since the request was filed');
-- The snapshot is meaningful (not all errors):
select matches((select body from snap where label = 'accepted'), 'send follow-up: ok:1',
  'the sender can keep sending follow-ups');
select matches((select body from snap where label = 'accepted'), 'request status: 42501',
  'the sender cannot read the request status');
select matches((select body from snap where label = 'accepted'), 'recipient member state: <no rows>',
  'the sender cannot read the recipient''s membership row (no read receipts, mute or join time)');
select matches((select body from snap where label = 'accepted'), 'roster: S,R',
  'the roster lists the recipient in every state');
select matches((select body from snap where label = 'accepted'), 'add recipient: P0001:member_join_not_allowed',
  'the sender adding the recipient fails the same way in every state');
select matches((select body from snap where label = 'accepted'), 'request again, no conversation: P0001:request_not_allowed',
  'a second request fails the same way in every state');
select matches((select body from snap where label = 'accepted'), 'leave and rejoin: ok:1',
  'the sender can leave and rejoin in every state');

-- ------------------------------------------------ the reply is the signal
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a3');  -- ravi
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a3', 'hi sam')$$,
  'the recipient replies');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a2');  -- rita (pending)
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a2', 'hi sam')$$,
  'P0001', 'dm_not_allowed', 'a pending recipient cannot reply');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a4');  -- rosa (declined)
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a4', 'hi sam')$$,
  'P0001', 'dm_not_allowed', 'a declined recipient cannot reply (same error as pending)');

select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam
select is(
  (select array_agg(body order by body) from public.messages
   where conversation_id = 'c1000000-0000-4000-8000-000000000002'),
  array['hello from sam', 'hi sam'], 'after the reply, the sender sees it');
select is(
  replace(pg_temp.sender_view('c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
                              'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a3'),
          ',R=hi sam', ''),
  (select body from snap where label = 'pending'),
  'the reply is the ONLY difference in the sender''s view');

-- ------------------------------------------------ blocks: observable, but not acceptance
reset role;
insert into public.blocks (blocker_id, blocked_id) values
  ('a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000a1'),
  ('a0000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-0000000000a1'),
  ('a0000000-0000-4000-8000-0000000000a4', 'a0000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam
insert into snap values
  ('blocked pending', pg_temp.sender_actions('c1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
                                             'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2')),
  ('blocked accepted', pg_temp.sender_actions('c1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
                                              'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a3')),
  ('blocked declined', pg_temp.sender_actions('c1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003',
                                              'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a4'));
select is((select body from snap where label = 'blocked accepted'), (select body from snap where label = 'blocked pending'),
  'after a block, the sender''s actions are identical for accepted and pending');
select is((select body from snap where label = 'blocked declined'), (select body from snap where label = 'blocked pending'),
  'after a block, the sender''s actions are identical for declined and pending');
select matches((select body from snap where label = 'blocked pending'), 'send follow-up: P0001:dm_not_allowed',
  'a block stops the sender''s follow-ups (in every state)');
reset role;
delete from public.blocks where blocked_id = 'a0000000-0000-4000-8000-0000000000a1';

-- ------------------------------------------ read receipts in a normal thread
-- alice ↔ bob are mutual (seed): a direct thread.
set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
insert into public.conversations (id, created_by)
values ('c1000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111');
insert into public.conversation_members (conversation_id, user_id) values
  ('c1000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c1000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222')$$,
  'a creator can add a connected (mutual) user directly');
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');  -- bob
update public.conversation_members set last_read_at = now()
 where conversation_id = 'c1000000-0000-4000-8000-000000000010'
   and user_id = '22222222-2222-4222-8222-222222222222';
select is((select count(*)::int from public.conversation_members
           where conversation_id = 'c1000000-0000-4000-8000-000000000010'
             and user_id = '22222222-2222-4222-8222-222222222222'
             and last_read_at is not null),
  1, 'bob reads his own last_read_at');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
select is((select count(*)::int from public.conversation_members
           where conversation_id = 'c1000000-0000-4000-8000-000000000010'
             and user_id = '22222222-2222-4222-8222-222222222222'),
  0, 'alice cannot read bob''s membership row (last_read_at / muted_until / left_at)');
select is(
  (select array_agg(user_id order by user_id) from public.conversation_roster
   where conversation_id = 'c1000000-0000-4000-8000-000000000010'),
  array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[],
  'alice sees who is in the thread through conversation_roster');
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'conversation_roster'),
  array['conversation_id', 'user_id'], 'the roster exposes no read, mute, join or leave state');
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');  -- dave, outsider
select is((select count(*)::int from public.conversation_roster
           where conversation_id = 'c1000000-0000-4000-8000-000000000010'),
  0, 'a non-member sees no roster');

-- =========================================================================
-- A. DIRECTION TABLE
-- =========================================================================
-- minor → unconnected adult: a request, never a direct add.
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b1');  -- mia (15)
insert into public.conversations (id, created_by)
values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1'),
       ('c2000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-0000000000b1');
insert into public.conversation_members (conversation_id, user_id) values
  ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1'),
  ('c2000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-0000000000b1');
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-0000000000a5')$$,
  'P0001', 'member_join_not_allowed', 'minor → unconnected adult: no direct add (must be a request)');
insert into public.messages (conversation_id, sender_id, body)
values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 'hi ann, love your art');
select lives_ok(
  $$insert into public.message_requests (id, sender_id, recipient_id, conversation_id)
    values ('d2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1',
            'a0000000-0000-4000-8000-0000000000a5', 'c2000000-0000-4000-8000-000000000001')$$,
  'minor → unconnected adult: allowed as a message request');
select is(
  (select row(initiated_by, initiator_was_minor, has_minor, moderation_sensitivity, retention_class)::text
   from public.conversations where id = 'c2000000-0000-4000-8000-000000000001'),
  row('a0000000-0000-4000-8000-0000000000b1'::uuid, true, true, 'elevated'::text, 'extended'::text)::text,
  'a minor''s thread records initiated_by / initiator_was_minor and is flagged has_minor, elevated, extended');
select throws_ok(
  $$update public.conversations set has_minor = false where id = 'c2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'clients cannot write the minor flags');

-- adult replying in a thread the minor started: allowed, fully.
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a5');  -- ann
select lives_ok(
  $$update public.message_requests set status = 'accepted' where id = 'd2000000-0000-4000-8000-000000000001'$$,
  'the adult accepts the minor''s request');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a5', 'thank you!')$$,
  'adult replying in a thread the minor initiated: allowed');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a5', 'keep drawing')$$,
  'adult replying again in that thread: allowed (fully, not a one-off)');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b1');  -- mia
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 'thanks')$$,
  'the minor keeps talking in her thread');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a5');  -- ann
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'member_join_not_allowed', 'nobody can be added to a request thread');

-- adult → unconnected minor, a NEW thread: refused, even for the adult she messaged.
insert into public.conversations (id, created_by)
values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a5');
insert into public.conversation_members (conversation_id, user_id)
values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a5');
select is((select initiator_was_minor from public.conversations where id = 'c2000000-0000-4000-8000-000000000002'),
  false, 'an adult''s thread is not minor-initiated');
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id, conversation_id)
    values ('a0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000b1',
            'c2000000-0000-4000-8000-000000000002')$$,
  'P0001', 'request_not_allowed', 'adult cannot start a NEW thread (request) to that same unconnected minor');
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'member_join_not_allowed', 'adult cannot add that unconnected minor to a new thread');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam, a stranger to mia
select throws_ok(
  $$insert into public.message_requests (sender_id, recipient_id)
    values ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'request_not_allowed', 'adult → unconnected minor: blocked in the database');
reset role;
select set_config('request.jwt.claims', '', true);  -- service path
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000b1')$$,
  'P0001', 'member_join_not_allowed', 'even the service path cannot put an unconnected minor in an adult''s thread');

-- blocks always win, both directions, even in the minor's own thread.
insert into public.blocks (blocker_id, blocked_id)
values ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000a5');
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a5');  -- ann
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a5', 'hello?')$$,
  'P0001', 'dm_not_allowed', 'a block stops the adult in the minor-initiated thread');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b1');  -- mia
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 'hello?')$$,
  'P0001', 'dm_not_allowed', 'a block stops the minor too (either direction)');
reset role;
delete from public.blocks where blocker_id = 'a0000000-0000-4000-8000-0000000000b1';

-- connected: the adult may start a new thread with the minor.
insert into public.relationships (actor_id, subject_id, state, distinct_weeks, interaction_count,
                                  first_seen_at, last_seen_at) values
  ('a0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000b1', 'regular', 4, 4, now(), now()),
  ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000a5', 'regular', 4, 4, now(), now());
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a5');  -- ann
select lives_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000b1')$$,
  'once connected (mutual), the adult can start a thread with the minor');
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a5', 'hi mia')$$,
  'adult → connected minor: allowed');
select is((select has_minor from public.conversations where id = 'c2000000-0000-4000-8000-000000000002'),
  true, 'a minor joining an adult''s thread flags it has_minor');
reset role;
delete from public.relationships
 where actor_id in ('a0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000b1')
   and subject_id in ('a0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a5', 'still there?')$$,
  'P0001', 'dm_not_allowed', 'when the connection lapses, the adult cannot message the minor in the adult''s thread');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b1');  -- mia
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000b1', 'yes')$$,
  'the minor still may (minor → anyone)');

-- minor → unconnected minor: a request, accepted, both talk.
insert into public.conversations (id, created_by)
values ('c2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b1');
insert into public.conversation_members (conversation_id, user_id)
values ('c2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b1');
insert into public.messages (conversation_id, sender_id, body)
values ('c2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b1', 'hey max');
select lives_ok(
  $$insert into public.message_requests (id, sender_id, recipient_id, conversation_id)
    values ('d2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b1',
            'a0000000-0000-4000-8000-0000000000b2', 'c2000000-0000-4000-8000-000000000003')$$,
  'minor → unconnected minor: allowed as a message request');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b2');  -- max
update public.message_requests set status = 'accepted' where id = 'd2000000-0000-4000-8000-000000000003';
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b2', 'hey mia')$$,
  'minor ↔ minor: the recipient replies after accepting');

-- adult → adult after acceptance: both directions (old can_dm refused an
-- unverified adult here).
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');  -- sam
select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'great to hear')$$,
  'adult → adult: the sender keeps talking after the recipient replied');
select is((select has_minor from public.conversations where id = 'c1000000-0000-4000-8000-000000000002'),
  false, 'an adult-only thread is not flagged');
select is(
  (select row(moderation_sensitivity, retention_class)::text from public.conversations
   where id = 'c1000000-0000-4000-8000-000000000002'),
  row('standard'::text, 'standard'::text)::text, 'an adult-only thread keeps standard sensitivity and retention');

-- =========================================================================
-- C. MINOR-THREAD LIMITS (mia's thread with ann, c2…01)
-- =========================================================================
reset role;
insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, width, height)
values ('f2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 'image', 'ready',
        'supabase', 'a0000000-0000-4000-8000-0000000000b1/pic.jpg', 100, 100);
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000b1');  -- mia
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, media_id)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1',
            'f2000000-0000-4000-8000-000000000001')$$,
  '23514', 'minor_thread_no_media', 'minor thread: a media attachment is rejected');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, shared_post_id)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1',
            'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '23514', 'minor_thread_no_media', 'minor thread: a shared post is rejected');
select is(
  (select array_agg(b) from unnest(array[
     'look https://example.com', 'http://x.y', 'HTTPS://EVIL.COM/path', 'ftp://files.net',
     'go to www.example.org', 'WWW.thing', 'www。example',
     'example.com', 'my snap is on t.me/abc', 'bit.ly/xyz', 'discord.gg/room', 'email me mia@gmail.com',
     'sub.domain.co.uk', 'site.io!', 'example．com', 'visit example dot com', 'example (dot) com',
     'example [dot] net', 'server 192.168.0.12'
   ]) b
   where pg_temp.probe(array[format(
     'insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)',
     'c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', b)])
     <> '23514:minor_thread_no_links'),
  null, 'minor thread: every link variant (scheme, www, bare domain, full-width dot, "dot", IP) is rejected');
select is(
  (select array_agg(b) from unnest(array[
     'see you at 5. ok?', 'I got a 9.5 on the test', 'done.it was fun', 'ok.so what now',
     'e.g. this', 'meet at 3 p.m.', 'dotted lines', 'the U.S. team', 'version 1.2', 'polka dots'
   ]) b
   where pg_temp.probe(array[format(
     'insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)',
     'c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', b)])
     <> 'ok:1'),
  null, 'minor thread: plain text (including dots, numbers, abbreviations) is allowed');
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a5');  -- ann
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('c2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a5', 'add me on snapchat.com')$$,
  '23514', 'minor_thread_no_links', 'the adult in a minor thread cannot send links either');
select throws_ok(
  $$update public.messages set body = 'actually: www.example.com'
    where conversation_id = 'c2000000-0000-4000-8000-000000000001' and body = 'keep drawing'$$,
  '23514', 'minor_thread_no_links', 'a link cannot be edited into a minor-thread message');

-- extended retention: soft delete only, bodies kept.
select lives_ok(
  $$update public.messages set body = 'edited', edited_at = now()
    where conversation_id = 'c2000000-0000-4000-8000-000000000001' and body = 'keep drawing'$$,
  'ann edits her message');
select lives_ok(
  $$update public.messages set deleted_at = now()
    where conversation_id = 'c2000000-0000-4000-8000-000000000001' and body = 'edited'$$,
  'ann soft-deletes it');
select throws_ok(
  $$delete from public.messages where conversation_id = 'c2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'clients cannot hard-delete messages');
reset role;
set local role service_role;
select throws_ok(
  $$delete from public.messages where conversation_id = 'c2000000-0000-4000-8000-000000000001'$$,
  'P0001', 'minor_thread_no_hard_delete', 'even the service role cannot hard-delete in an extended thread');
select is(
  pg_temp.probe(array['set local app.retention_purge = ''on''',
                      $$delete from public.messages where conversation_id = 'c2000000-0000-4000-8000-000000000001'$$]),
  'ok:4', 'only the retention purge (app.retention_purge = on) may hard-delete there');
reset role;
select is(
  (select body from private.message_body_history
   where conversation_id = 'c2000000-0000-4000-8000-000000000001'),
  'keep drawing', 'the pre-edit body is preserved server-side for safety review');
select is(
  (select body from public.messages
   where conversation_id = 'c2000000-0000-4000-8000-000000000001' and deleted_at is not null),
  'edited', 'the soft-deleted message keeps its body');

-- a minor cannot join a thread whose history holds links (service path).
select set_config('request.jwt.claims', '', true);
insert into public.conversations (id, created_by) values
  ('c2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111');
insert into public.conversation_members (conversation_id, user_id)
values ('c2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111');
insert into public.messages (conversation_id, sender_id, body)
values ('c2000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'notes at alice.dev');
insert into public.relationships (actor_id, subject_id, state, distinct_weeks, interaction_count,
                                  first_seen_at, last_seen_at) values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-0000000000b2', 'regular', 4, 4, now(), now()),
  ('a0000000-0000-4000-8000-0000000000b2', '11111111-1111-4111-8111-111111111111', 'regular', 4, 4, now(), now());
select throws_ok(
  $$insert into public.conversation_members (conversation_id, user_id)
    values ('c2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-0000000000b2')$$,
  'P0001', 'member_join_not_allowed', 'a minor cannot join a thread whose history holds links');

-- =========================================================================
-- D. MEDIA HARDENING + TRUNCATE
-- =========================================================================
set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');  -- alice
insert into storage.objects (bucket_id, name, owner_id) values
  ('media', '11111111-1111-4111-8111-111111111111/att.mp4',        '11111111-1111-4111-8111-111111111111'),
  ('media', '11111111-1111-4111-8111-111111111111/att-poster.jpg', '11111111-1111-4111-8111-111111111111'),
  ('media', '11111111-1111-4111-8111-111111111111/orphan.jpg',     '11111111-1111-4111-8111-111111111111');
insert into public.media_assets (id, owner_id, kind, status, provider, provider_asset_id, poster_path, duration_ms)
values ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'video', 'uploading',
        'supabase', '11111111-1111-4111-8111-111111111111/att.mp4',
        '11111111-1111-4111-8111-111111111111/att-poster.jpg', 20000);

select throws_ok(
  $$update public.media_assets set status = 'ready' where id = 'f2000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'clients cannot update media_assets.status');
select throws_ok(
  $$update public.media_assets set duration_ms = 1000 where id = 'f2000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'clients cannot update media_assets.duration_ms');
select lives_ok(
  $$update public.media_assets set deleted_at = now() where id = 'f2000000-0000-4000-8000-000000000002'$$,
  'the owner can soft-delete her media');
select throws_ok(
  $$update public.media_assets set deleted_at = null where id = 'f2000000-0000-4000-8000-000000000002'$$,
  '23514', 'media_deletion_is_final', 'deleted media cannot be restored by a client');
select is(
  pg_temp.probe(array[$$update storage.objects set metadata = '{"swapped":true}'
                        where bucket_id = 'media' and name = '11111111-1111-4111-8111-111111111111/att.mp4'$$]),
  'ok:0', 'an attached video object cannot be overwritten (UPDATE / upsert)');
select is(
  pg_temp.probe(array['set local storage.allow_delete_query = ''true''',
                      $$delete from storage.objects where bucket_id = 'media'
                        and name in ('11111111-1111-4111-8111-111111111111/att.mp4',
                                     '11111111-1111-4111-8111-111111111111/att-poster.jpg')$$]),
  'ok:0', 'attached video and poster objects cannot be deleted by the client (even after soft delete)');
select is(
  pg_temp.probe(array['set local storage.allow_delete_query = ''true''',
                      $$delete from storage.objects where bucket_id = 'media'
                        and name = '11111111-1111-4111-8111-111111111111/orphan.jpg'$$]),
  'ok:1', 'the owner can still delete an unattached orphan upload');
reset role;
set local storage.allow_delete_query = 'true';
delete from storage.objects where name = '11111111-1111-4111-8111-111111111111/att.mp4';  -- server purge
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('media', '11111111-1111-4111-8111-111111111111/att.mp4', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'a client cannot re-upload different bytes at a path a media row points at');
select throws_ok($$truncate public.follows$$, '42501', null, 'authenticated cannot TRUNCATE');
reset role;

select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_table_privilege('anon', c.oid, 'TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
  null, 'no table or view in public grants TRUNCATE to anon or authenticated');
create table public.zz_truncate_probe (id int);
select is(
  has_table_privilege('authenticated', 'public.zz_truncate_probe', 'TRUNCATE')
    or has_table_privilege('anon', 'public.zz_truncate_probe', 'TRUNCATE'),
  false, 'tables created later do not grant TRUNCATE either (default privileges)');

-- helpers stay internal
set local role authenticated;
select pg_temp.act_as('a0000000-0000-4000-8000-0000000000a1');
select throws_ok($$select private.may_message(null, null, null)$$, '42501', null,
  'clients cannot call the DM rule helpers');

select * from finish();
rollback;
