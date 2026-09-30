-- Migration 024: the speech dial. Levels, the minor cap (refuse + clamp), the
-- old strictness -> room level mapping, per-post room level, required_level on
-- content rows with minors unable to SELECT above standard, and the harassment
-- pair counter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
\set alice  '''11111111-1111-4111-8111-111111111111'''
\set bob    '''22222222-2222-4222-8222-222222222222'''
\set minnie '''33333333-3333-4333-8333-333333333333'''

-- ------------------------------------------------------------------ the dial
select is(enum_range(null::public.speech_level)::text, '{family,standard,open,max}', 'four levels, in dial order');
select ok('family'::public.speech_level < 'standard' and 'open'::public.speech_level < 'max', 'levels compare in dial order');
select ok(not exists (select 1 from pg_type where typname = 'chat_strictness'), 'the old chat_strictness type is gone');
select has_column('public', 'live_streams', 'room_level', 'live_streams.room_level (was chat_strictness)');
select has_column('public', 'users', 'default_room_level', 'users.default_room_level (was default_chat_strictness)');
select hasnt_column('public', 'live_streams', 'chat_strictness', 'chat_strictness is renamed away');
select is((select count(*)::int from public.users where speech_level <> 'standard'), 0, 'everyone starts at standard');

-- The 021/022 mapping, as the migration applies it: protected -> family, others unchanged.
select is(
  (select array_agg((case v when 'protected' then 'family' else v end)::public.speech_level::text order by v)
     from unnest(array['open', 'protected', 'standard']) v),
  array['open', 'family', 'standard'], 'mapping: open->open, protected->family, standard->standard');

-- ------------------------------------------------------------------ minors capped at standard
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$update public.users set speech_level = 'max' where id = '11111111-1111-4111-8111-111111111111'$$),
          'ok:1', 'an adult can choose Max');
select pg_temp.act_as(:minnie);
select is(pg_temp.probe($$update public.users set speech_level = 'open' where id = '33333333-3333-4333-8333-333333333333'$$),
          '22023', 'a minor cannot choose Open');
select is(pg_temp.probe($$update public.users set default_room_level = 'max' where id = '33333333-3333-4333-8333-333333333333'$$),
          '22023', 'a minor cannot set their room above Standard');
select is(pg_temp.probe($$update public.users set speech_level = 'family' where id = '33333333-3333-4333-8333-333333333333'$$),
          'ok:1', 'a minor can choose Family');
select pg_temp.act_as(:bob);
select is(pg_temp.probe($$update public.users set speech_level = 'max' where id = '33333333-3333-4333-8333-333333333333'$$),
          'ok:0', 'nobody sets another person''s level');
reset role;

-- A date-of-birth correction that makes someone a minor clamps them.
update public.users set speech_level = 'max', default_room_level = 'open' where id = :bob;
update public.users set date_of_birth = current_date - interval '16 years' where id = :bob;
select is((select speech_level::text from public.users where id = :bob), 'standard', 'age change clamps speech_level to Standard');
select is((select default_room_level::text from public.users where id = :bob), 'standard', 'age change clamps default_room_level to Standard');

-- ------------------------------------------------------------------ per-post room level
update public.users set default_room_level = 'open' where id = :alice;
insert into public.posts (id, author_id, kind, caption) values ('24000000-0000-4000-8000-000000000001', :alice, 'post', 'room test');
select is((select room_level::text from public.posts where id = '24000000-0000-4000-8000-000000000001'), 'open',
          'a new post''s comment room starts at the author''s default');
insert into public.posts (id, author_id, kind, caption, room_level) values ('24000000-0000-4000-8000-000000000002', :alice, 'post', 'x', 'family');
select is((select room_level::text from public.posts where id = '24000000-0000-4000-8000-000000000002'), 'family',
          'an explicit room level on the post wins');
insert into public.posts (id, author_id, kind, caption, room_level) values ('24000000-0000-4000-8000-000000000003', :minnie, 'post', 'y', 'max');
select is((select room_level::text from public.posts where id = '24000000-0000-4000-8000-000000000003'), 'standard',
          'a minor''s post room is capped at Standard');

-- ------------------------------------------------------------------ minors never SELECT above standard
insert into public.comments (id, post_id, author_id, body, required_level) values
  ('24000000-0000-4000-8000-0000000000c1', '24000000-0000-4000-8000-000000000001', :alice, 'hello', 'family'),
  ('24000000-0000-4000-8000-0000000000c2', '24000000-0000-4000-8000-000000000001', :alice, 'a swear', 'standard'),
  ('24000000-0000-4000-8000-0000000000c3', '24000000-0000-4000-8000-000000000001', :alice, 'a roast', 'open'),
  ('24000000-0000-4000-8000-0000000000c4', '24000000-0000-4000-8000-000000000001', :alice, 'an edgy joke', 'max');
insert into public.live_streams (id, host_id, provider) values ('24000000-0000-4000-8000-0000000000aa', :alice, 'test');
insert into public.live_chat_messages (stream_id, user_id, body, required_level) values
  ('24000000-0000-4000-8000-0000000000aa', :alice, 'hi', 'family'),
  ('24000000-0000-4000-8000-0000000000aa', :alice, 'roast', 'open'),
  ('24000000-0000-4000-8000-0000000000aa', :alice, 'edgy', 'max');

set local role authenticated;
select pg_temp.act_as(:minnie);
select is((select count(*)::int from public.comments where post_id = '24000000-0000-4000-8000-000000000001'), 2,
          'a minor sees only Family and Standard comments');
select is((select count(*)::int from public.comments where post_id = '24000000-0000-4000-8000-000000000001' and required_level > 'standard'), 0,
          'no Open / Max comment row reaches a minor');
select is((select count(*)::int from public.live_chat_messages where stream_id = '24000000-0000-4000-8000-0000000000aa'), 1,
          'a minor sees only the Family chat line');
select pg_temp.act_as(:alice);
select is((select count(*)::int from public.comments where post_id = '24000000-0000-4000-8000-000000000001'), 4,
          'an adult receives every row (their client hides / masks by level)');
select is((select count(*)::int from public.live_chat_messages where stream_id = '24000000-0000-4000-8000-0000000000aa'), 3,
          'an adult receives every chat line');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.live_chat_messages where stream_id = '24000000-0000-4000-8000-0000000000aa'), 1,
          'signed-out readers get the minor view');
reset role;

-- The client writes required_level with the row.
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$insert into public.comments (post_id, author_id, body, required_level) values ('24000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'lol', 'open')$$),
          'ok:1', 'a comment is written with its required_level');
reset role;

-- ------------------------------------------------------------------ events + harassment counter
select has_column('ops', 'content_filter_events', 'required_level', 'events record the required level');
delete from ops.content_filter_pair_counts where sender_id = :alice and target_id = :bob;
select is(ops.content_filter_bump_pair(:alice, :bob, 60), 1, 'first hostile message: 1');
select is(ops.content_filter_bump_pair(:alice, :bob, 60), 2, 'second inside the window: 2');
update ops.content_filter_pair_counts set window_start = now() - interval '2 hours' where sender_id = :alice and target_id = :bob;
select is(ops.content_filter_bump_pair(:alice, :bob, 60), 1, 'after the window it starts again');
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$select ops.content_filter_bump_pair('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 60)$$),
          '42501', 'clients cannot touch the counter');
reset role;

select * from finish();
rollback;
