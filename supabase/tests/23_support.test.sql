-- Migration 023: support. Tier 0 tree as data (integrity + read-only for
-- clients), node-hit tracking and the moderator-only insights RPC, Tier 2
-- tickets (own rows, DB-owned priority/deadline, rate limit that never blocks
-- self-harm), and the Tier 1 circuit breaker in the database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

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

\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set sess  '''5e550000-0000-4000-8000-000000000001'''

-- ================================================================== tree
select has_table('public', 'support_nodes', 'support_nodes exists');
select has_table('public', 'support_edges', 'support_edges exists');
select ok((select count(*) from public.support_nodes) >= 30, 'a real tree is seeded');
select is((select kind::text from public.support_nodes where id = 'start'), 'question', 'the tree starts with a question');

-- Every node is reachable from start.
select is((
  with recursive reach(id) as (
    select 'start'::text
    union select e.to_node from public.support_edges e join reach r on r.id = e.from_node)
  select count(*)::int from public.support_nodes n where n.id not in (select id from reach)), 0,
  'every node is reachable from start');
-- Every terminal node resolves (done) or offers escalation.
select is((select count(*)::int from public.support_nodes n
            where not exists (select 1 from public.support_edges e where e.from_node = n.id)
              and n.kind <> 'escalate' and n.id <> 'done'), 0,
  'every terminal node is an escalation or the resolved ending');
select is((select count(*)::int from public.support_nodes n
            where n.kind = 'answer' and n.id <> 'done'
              and not (exists (select 1 from public.support_edges e where e.from_node = n.id and e.to_node = 'done')
                   and exists (select 1 from public.support_edges e join public.support_nodes t on t.id = e.to_node
                                where e.from_node = n.id and t.kind = 'escalate'))), 0,
  'every answer offers both "that did it" and an escalation');
select is((select count(*)::int from public.support_nodes n
            where n.kind = 'question'
              and (select count(*) from public.support_edges e where e.from_node = n.id) < 2), 0,
  'every question offers at least two answers');
select is((select count(*)::int from public.support_edges e join public.support_nodes n on n.id = e.from_node
            where n.kind = 'escalate'), 0, 'escalation nodes are terminal');
select is(pg_temp.probe($$insert into public.support_edges (from_node, to_node, label) values ('still_stuck', 'done', 'x')$$),
          '23514', 'an edge out of an escalation node is refused');
select set_eq($$select human_category::text from public.support_nodes where human_category is not null$$,
              array['money', 'appeal', 'self_harm', 'legal'], 'all four human categories have an escalation node');
select ok(exists (select 1 from public.support_edges where from_node = 'start' and to_node = 'escalate.self_harm'),
          'self-harm is reachable on the very first question (no triage)');
select ok((select count(*) from public.support_nodes where fix_route is not null) >= 8,
          'answers deep-link into the app with fix routes');
select is(pg_temp.probe($$insert into public.support_nodes (id, kind, prompt, fix_route) values ('bad', 'answer', 'x', '/x')$$),
          '23514', 'a fix route needs a label');
select is(pg_temp.probe($$insert into public.support_nodes (id, kind, prompt, human_category) values ('bad', 'answer', 'x', 'money')$$),
          '23514', 'only escalation nodes carry a human category');

set local role anon;
select ok((select count(*) from public.support_nodes) >= 30, 'anon can read the tree');
select ok((select count(*) from public.support_edges) >= 30, 'anon can read the edges');
select is(pg_temp.probe($$insert into public.support_nodes (id, kind, prompt) values ('x', 'answer', 'x')$$), '42501',
          'anon cannot add nodes');
reset role;
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe($$update public.support_nodes set prompt = 'hacked' where id = 'start'$$), '42501',
          'a signed-in user cannot edit the tree');
select is(pg_temp.probe($$delete from public.support_edges$$), '42501', 'a signed-in user cannot delete edges');

-- ================================================================== hits
-- Start from a clean slate inside this transaction (dev activity leaves real hits behind).
reset role;
delete from public.support_hits;
set local role authenticated;
select pg_temp.act_as(:alice);
select lives_ok(format($$select public.support_hit('start', %L)$$, :sess), 'a signed-in user records a hit');
select lives_ok(format($$select public.support_hit('start', %L)$$, :sess), 'a double tap is accepted');
select is(pg_temp.probe($$select 1 from public.support_hits$$), '42501', 'hits are not readable by clients');
select is(pg_temp.probe(format($$select public.support_hit('nope', %L)$$, :sess)), '22023', 'unknown nodes are refused');
select is(pg_temp.probe($$select public.support_insights(30)$$), '42501', 'insights are moderators-only');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select lives_ok($$select public.support_hit('video', '5e550000-0000-4000-8000-000000000002')$$, 'anon can record a hit');
reset role;
select is((select count(*)::int from public.support_hits where session_id = :sess and node_id = 'start'), 1,
          'repeats inside 10 seconds are counted once');
select is((select user_id from public.support_hits where session_id = :sess limit 1), :alice::uuid,
          'the hit is attributed to the caller');
select is((select user_id from public.support_hits where session_id = '5e550000-0000-4000-8000-000000000002'), null::uuid,
          'an anonymous hit has no user');

update public.users set app_role = 'moderator' where id = :bob;
insert into public.support_hits (node_id, session_id) select 'notif.types', gen_random_uuid() from generate_series(1, 5);
set local role authenticated;
select pg_temp.act_as(:bob);
select is((select node_id from public.support_insights(30) limit 1), 'notif.types', 'a moderator sees the most-hit node first');
select is((select hits from public.support_insights(30) where node_id = 'notif.types'), 5::bigint, 'with its hit count');
reset role;

-- ================================================================== tickets
set local role authenticated;
select pg_temp.act_as(:alice);
insert into public.support_tickets (category, node_id, session_id) values ('self_harm', 'escalate.self_harm', :sess);
insert into public.support_tickets (category, body) values ('money', 'I was charged twice');
select is((select priority from public.support_tickets where category = 'self_harm'), 'urgent', 'self-harm is urgent');
select is((select first_response_due - created_at from public.support_tickets where category = 'self_harm'),
          interval '1 hour', 'self-harm first response is due within the hour');
select is((select first_response_due - created_at from public.support_tickets where category = 'money'),
          interval '24 hours', 'money first response is due in 24 hours');
select is((select user_id from public.support_tickets where category = 'money'), :alice::uuid, 'the ticket is owned by the caller');
select is(pg_temp.probe($$insert into public.support_tickets (category, status) values ('general', 'resolved')$$), '42501',
          'a user cannot set the status');
select is(pg_temp.probe($$insert into public.support_tickets (category, priority) values ('general', 'urgent')$$), '42501',
          'a user cannot set the priority');
select is(pg_temp.probe(format($$insert into public.support_tickets (category, user_id) values ('general', %L)$$, :bob)), '42501',
          'a user cannot file a ticket as someone else');
select is(pg_temp.probe($$update public.support_tickets set body = 'more detail' where category = 'money'$$), 'ok:1',
          'a user can add detail to their open ticket');
select is(pg_temp.probe($$update public.support_tickets set status = 'resolved'$$), '42501', 'a user cannot resolve a ticket');
insert into public.support_tickets (category) select 'general' from generate_series(1, 8);
select is(pg_temp.probe($$insert into public.support_tickets (category) values ('general')$$), 'P0001',
          'the 11th ticket in 24 hours is rate limited');
select is(pg_temp.probe($$insert into public.support_tickets (category) values ('self_harm')$$), 'ok:1',
          'a self-harm ticket is never rate limited');
select pg_temp.act_as(:bob);
-- probe() rolls its statement back, so 10 rows remain.
select is((select count(*)::int from public.support_tickets where user_id = :alice), 10, 'a moderator sees every ticket');
reset role;
update public.users set app_role = 'user' where id = :bob;
set local role authenticated;
select pg_temp.act_as(:bob);
select is((select count(*)::int from public.support_tickets where user_id = :alice), 0, 'other users see none of them');
reset role;
set local role anon;
select is(pg_temp.probe($$insert into public.support_tickets (category) values ('general')$$), '42501', 'anon cannot file tickets');
reset role;

-- ================================================================== Tier 1 circuit breaker
select ok(not has_schema_privilege('authenticated', 'ops', 'usage'), 'API roles cannot reach the ops schema');
set local role authenticated;
select pg_temp.act_as(:alice);
select is(pg_temp.probe(format($$select ops.support_ai_admit(%L, %L, null, 100)$$, :alice, :sess)), '42501',
          'a client cannot call the admission function');
reset role;

select is(ops.support_ai_cost(1000000, 0), 100000::bigint, '1M input tokens cost $1.00 (100000 millicents)');
select is(ops.support_ai_cost(0, 1000000), 500000::bigint, '1M output tokens cost $5.00');
select is((select daily_cap_millicents from ops.support_ai_config), 500000::bigint, 'default global cap is $5/day');
select is((select per_user_daily_exchanges from ops.support_ai_config), 10, 'default per-user quota is 10');
select is((select conversation_token_cap || '/' || conversation_max_turns from ops.support_ai_config), '4000/8',
          'default conversation caps are 4000 tokens and 8 turns');

-- Budget: cap 10 millicents. One call's worst case (100 in + 400 out = 210) cannot fit -> trips.
update ops.support_ai_config set daily_cap_millicents = 10;
select is(ops.support_ai_admit(:alice, :sess, null, 100) ->> 'reason', 'budget',
          'a call whose worst case exceeds the remaining budget is refused');
select ok((select tripped_at is not null from ops.support_ai_budget where day = ops.support_ai_today()),
          'and the breaker trips automatically');
select is(ops.support_ai_status(:alice) ->> 'tripped', 'true', 'status reports Tier 1 off');
update ops.support_ai_config set daily_cap_millicents = 1000000;
select is(ops.support_ai_admit(:alice, :sess, null, 100) ->> 'reason', 'budget',
          'once tripped it stays off for the day, even if config changes');
delete from ops.support_ai_budget;

-- Settlement that crosses the cap trips the breaker.
update ops.support_ai_config set daily_cap_millicents = 300;
create temp table adm as select ops.support_ai_admit(:alice, :sess, null, 100) as r;
select is((select r ->> 'ok' from adm), 'true', 'a call that fits is admitted');
select is((select reserved_millicents from ops.support_ai_budget where day = ops.support_ai_today()), 210::bigint,
          'admission reserves the worst-case cost');
select is(ops.support_ai_settle(:alice, (select (r ->> 'conversation_id')::uuid from adm), ops.support_ai_today(), 210,
                                'm', 2000, 200, 'ok', null, 10, 'q', 'a') ->> 'tripped', 'true',
          'the call that reaches the cap trips the breaker');
select is((select reserved_millicents || '/' || spent_millicents from ops.support_ai_budget where day = ops.support_ai_today()),
          '0/300', 'reservation released, real cost charged');
select is((select count(*)::int from ops.support_ai_calls where user_id = :alice and outcome = 'ok'), 1, 'the call is logged');
delete from ops.support_ai_budget;
update ops.support_ai_config set daily_cap_millicents = 500000;

-- Per-user quota: alice has used 1 exchange today (the admitted call above). Cap at 1.
update ops.support_ai_config set per_user_daily_exchanges = 1;
select is(ops.support_ai_admit(:alice, :sess, null, 100) ->> 'reason', 'user_quota', 'the per-user daily quota refuses');
update ops.support_ai_config set per_user_daily_exchanges = 10;

-- Turn and token caps.
update ops.support_ai_config set conversation_max_turns = 1;
select is(ops.support_ai_admit(:alice, :sess, (select (r ->> 'conversation_id')::uuid from adm), 100) ->> 'reason', 'turns',
          'the turn cap ends the conversation');
update ops.support_ai_config set conversation_max_turns = 8;
select is(ops.support_ai_admit(:alice, :sess, null, 3990) ->> 'reason', 'tokens', 'the token cap refuses an oversized conversation');
select is(ops.support_ai_admit(:bob, :sess, (select (r ->> 'conversation_id')::uuid from adm), 100) ->> 'reason', 'conversation',
          'a conversation belongs to its user');
update ops.support_ai_config set enabled = false;
select is(ops.support_ai_admit(:alice, :sess, null, 100) ->> 'reason', 'disabled', 'config can switch Tier 1 off');

select * from finish();
rollback;
