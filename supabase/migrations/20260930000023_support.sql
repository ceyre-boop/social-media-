-- ============================================================================
-- 023 — Support system (brief M3 §4).
--
-- Tier 0  guided help, zero API cost.
--   support_nodes / support_edges  the decision tree, stored as DATA. Readable by
--                                  anon + authenticated; no client writes. Edit
--                                  it with the service role (Studio / SQL) — no
--                                  deploy needed. Copy may use the tokens
--                                  {app} {moment} {moments} {currency}; the app
--                                  fills them from src/config/brand.ts so a
--                                  rename never touches this table.
--   support_hits                   one row per node shown (via support_hit()).
--                                  Frequently hit nodes are engineering defects;
--                                  support_insights() ranks them for moderators
--                                  and admins only.
-- Tier 2  humans, first touch, for four categories that are never AI-resolved:
--         money, appeals, self-harm (immediate, priority), legal.
--   support_tickets                RLS own rows. first_response_due and priority
--                                  are set by the database, never the client.
-- Tier 1  AI assistance (Claude Haiku 4.5 via the `support-ai` Edge Function).
--   ops.support_ai_config          every threshold (spend cap, quota, token and
--                                  turn caps, cache TTL, prices). Not constants.
--   ops.support_ai_budget          the circuit breaker: per-UTC-day spend with
--                                  in-flight reservations. Crossing the cap
--                                  trips it AUTOMATICALLY (tripped_at) and every
--                                  later admission is refused: Tier 1 is off and
--                                  the app routes everyone to Tier 0.
--   ops.support_ai_user_day        per-user daily exchange quota.
--   ops.support_ai_conversations   per-conversation token + turn caps.
--   ops.support_ai_messages        the transcript (server-side, authoritative).
--   ops.support_ai_cache           normalized-question hash -> answer, with TTL.
--   ops.support_ai_calls           every call: user, model, tokens, cost.
--   Money is integer MILLICENTS (1/1000 of a US cent): $5.00 = 500000.
--
-- The ops objects have no grants to anon / authenticated; only the Edge
-- Function (direct database connection) touches them.
-- Creator live-assistance billing is deferred (money + live are out of scope).
-- ============================================================================

-- ------------------------------------------------------------------ types
create type public.support_node_kind as enum ('question', 'answer', 'escalate');
create type public.support_category as enum ('money', 'appeal', 'self_harm', 'legal', 'general');

-- ------------------------------------------------------------------ tree
create table public.support_nodes (
  id              text primary key check (id ~ '^[a-z0-9][a-z0-9_.-]{0,62}$'),
  kind            public.support_node_kind not null,
  prompt          text not null check (length(prompt) between 1 and 300),
  body            text check (body is null or length(body) <= 2000),
  fix_route       text check (fix_route is null or fix_route ~ '^/[A-Za-z0-9/_.-]*$'),
  fix_label       text check (fix_label is null or length(fix_label) between 1 and 40),
  human_category  public.support_category,
  updated_at      timestamptz not null default now(),
  constraint support_nodes_fix_pair check ((fix_route is null) = (fix_label is null)),
  constraint support_nodes_category_escalate_only check (human_category is null or kind = 'escalate')
);

create table public.support_edges (
  from_node  text not null references public.support_nodes(id) on delete cascade,
  to_node    text not null references public.support_nodes(id) on delete cascade,
  label      text not null check (length(label) between 1 and 80),
  sort       integer not null default 0,
  primary key (from_node, to_node),
  constraint support_edges_not_self check (from_node <> to_node)
);
create index support_edges_from_idx on public.support_edges (from_node, sort);

-- Escalation nodes are terminal: the app renders their action (ticket form,
-- crisis resources, AI offer). Answer and question nodes lead somewhere.
create function private.support_escalate_is_terminal() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.support_nodes where id = new.from_node and kind = 'escalate') then
    raise exception 'support_escalate_is_terminal: % is an escalation node', new.from_node
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger support_edges_escalate_terminal
  before insert or update on public.support_edges
  for each row execute function private.support_escalate_is_terminal();

alter table public.support_nodes enable row level security;
alter table public.support_edges enable row level security;
revoke all on public.support_nodes, public.support_edges from public, anon, authenticated;
grant select on public.support_nodes, public.support_edges to anon, authenticated;
create policy support_nodes_read on public.support_nodes for select to anon, authenticated using (true);
create policy support_edges_read on public.support_edges for select to anon, authenticated using (true);

-- ------------------------------------------------------------------ hits
create table public.support_hits (
  id          bigint generated always as identity primary key,
  node_id     text not null references public.support_nodes(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  session_id  uuid not null,
  at          timestamptz not null default now()
);
create index support_hits_node_at_idx on public.support_hits (node_id, at);
create index support_hits_session_idx on public.support_hits (session_id, node_id);

alter table public.support_hits enable row level security;
revoke all on public.support_hits from public, anon, authenticated;
-- No policies: clients never read or write rows directly.

-- Record that a node was shown. user_id is the caller (null when signed out).
-- Repeats of the same node in the same session within 10s are ignored (double taps).
create function public.support_hit(p_node text, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_session is null then raise exception 'support_hit: session required' using errcode = '22023'; end if;
  if not exists (select 1 from public.support_nodes where id = p_node) then
    raise exception 'support_hit: unknown node' using errcode = '22023';
  end if;
  if exists (select 1 from public.support_hits
              where session_id = p_session and node_id = p_node and at > now() - interval '10 seconds') then
    return;
  end if;
  insert into public.support_hits (node_id, user_id, session_id) values (p_node, auth.uid(), p_session);
end $$;
revoke execute on function public.support_hit(text, uuid) from public;
grant execute on function public.support_hit(text, uuid) to anon, authenticated;

-- Most-hit nodes over the last p_days. Moderators and admins only.
create function public.support_insights(p_days integer default 30)
returns table (node_id text, kind public.support_node_kind, prompt text, human_category public.support_category,
               hits bigint, sessions bigint, people bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.i_am_moderator() then
    raise exception 'support_insights: moderators only' using errcode = '42501';
  end if;
  return query
    select n.id, n.kind, n.prompt, n.human_category,
           count(h.id), count(distinct h.session_id), count(distinct h.user_id)
      from public.support_nodes n
      join public.support_hits h on h.node_id = n.id
     where h.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
     group by n.id
     order by count(h.id) desc, n.id
     limit 50;
end $$;
revoke execute on function public.support_insights(integer) from public, anon;
grant execute on function public.support_insights(integer) to authenticated;

-- ------------------------------------------------------------------ tickets (Tier 2)
create table public.support_tickets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.users(id) on delete cascade,
  category            public.support_category not null,
  priority            text not null default 'normal' check (priority in ('urgent', 'normal')),
  status              text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  body                text check (body is null or length(body) <= 4000),
  node_id             text references public.support_nodes(id) on delete set null,
  session_id          uuid,
  created_at          timestamptz not null default now(),
  first_response_due  timestamptz not null,
  first_response_at   timestamptz,
  resolved_at         timestamptz
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_due_idx on public.support_tickets (priority, first_response_due) where status <> 'resolved';

-- The database owns priority, status and the response deadline:
--   self_harm       urgent, first response due in 1 hour
--   money / appeal / legal   24 hours
--   general         72 hours
-- Rate limit: 10 tickets per user per 24h, except self_harm, which is never refused.
create function private.support_ticket_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.status := 'open';
  new.created_at := now();
  new.first_response_at := null;
  new.resolved_at := null;
  new.priority := case when new.category = 'self_harm' then 'urgent' else 'normal' end;
  new.first_response_due := now() + case new.category
      when 'self_harm' then interval '1 hour'
      when 'general'   then interval '72 hours'
      else interval '24 hours' end;
  if new.category <> 'self_harm' and (
       select count(*) from public.support_tickets
        where user_id = new.user_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'support_ticket_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger support_tickets_defaults before insert on public.support_tickets
  for each row execute function private.support_ticket_defaults();

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
grant select on public.support_tickets to authenticated;
grant insert (category, body, node_id, session_id) on public.support_tickets to authenticated;
grant update (body) on public.support_tickets to authenticated;

create policy support_tickets_select_own on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()) or private.i_am_moderator());
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated with check (user_id = (select auth.uid()));
-- Add detail to your own ticket while it is still open.
create policy support_tickets_update_own on public.support_tickets
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'open')
  with check (user_id = (select auth.uid()) and status = 'open');

-- ============================================================================
-- Tier 1 — AI with the circuit breaker. ops schema only.
-- ============================================================================
create table ops.support_ai_config (
  id                          boolean primary key default true check (id),
  enabled                     boolean not null default true,
  model                       text    not null default 'claude-haiku-4-5-20251001',
  daily_cap_millicents        bigint  not null default 500000 check (daily_cap_millicents >= 0),  -- $5.00/day
  per_user_daily_exchanges    integer not null default 10   check (per_user_daily_exchanges >= 0),
  conversation_token_cap      integer not null default 4000 check (conversation_token_cap > 0),
  conversation_max_turns      integer not null default 8    check (conversation_max_turns > 0),
  max_output_tokens           integer not null default 400  check (max_output_tokens > 0),
  min_output_tokens           integer not null default 64   check (min_output_tokens > 0),
  cache_ttl                   interval not null default interval '7 days',
  -- Haiku 4.5: $1 / MTok input, $5 / MTok output, in millicents per million tokens.
  input_millicents_per_mtok   bigint  not null default 100000,
  output_millicents_per_mtok  bigint  not null default 500000,
  updated_at                  timestamptz not null default now()
);
insert into ops.support_ai_config default values;

create table ops.support_ai_budget (
  day                  date primary key,
  spent_millicents     bigint  not null default 0 check (spent_millicents >= 0),
  reserved_millicents  bigint  not null default 0 check (reserved_millicents >= 0),
  calls                integer not null default 0,
  tripped_at           timestamptz
);

create table ops.support_ai_user_day (
  user_id    uuid not null references public.users(id) on delete cascade,
  day        date not null,
  exchanges  integer not null default 0,
  primary key (user_id, day)
);

create table ops.support_ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  session_id  uuid not null,
  turns       integer not null default 0,
  tokens      integer not null default 0,
  created_at  timestamptz not null default now()
);
create index support_ai_conversations_user_idx on ops.support_ai_conversations (user_id, created_at desc);

create table ops.support_ai_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references ops.support_ai_conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  at               timestamptz not null default now()
);
create index support_ai_messages_conv_idx on ops.support_ai_messages (conversation_id, id);

create table ops.support_ai_cache (
  question_hash  text primary key check (question_hash ~ '^[0-9a-f]{64}$'),
  question       text not null,
  answer         text not null,
  model          text not null,
  hits           integer not null default 0,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);

create table ops.support_ai_calls (
  id               bigint generated always as identity primary key,
  user_id          uuid references public.users(id) on delete set null,
  conversation_id  uuid references ops.support_ai_conversations(id) on delete set null,
  model            text not null,
  outcome          text not null check (outcome in ('ok', 'error', 'cache_hit')),
  input_tokens     integer not null default 0 check (input_tokens >= 0),
  output_tokens    integer not null default 0 check (output_tokens >= 0),
  cost_millicents  bigint  not null default 0 check (cost_millicents >= 0),
  latency_ms       integer,
  error            text,
  at               timestamptz not null default now()
);
create index support_ai_calls_at_idx on ops.support_ai_calls (at);
create index support_ai_calls_user_idx on ops.support_ai_calls (user_id, at);

create function ops.support_ai_today() returns date
language sql stable as $$ select (now() at time zone 'utc')::date $$;

create function ops.support_ai_cost(p_in integer, p_out integer) returns bigint
language sql stable set search_path = ops as $$
  select ceil((greatest(p_in, 0)::numeric * c.input_millicents_per_mtok
             + greatest(p_out, 0)::numeric * c.output_millicents_per_mtok) / 1000000)::bigint
    from ops.support_ai_config c;
$$;

-- Is Tier 1 open for this user right now? (No reservation, no side effects.)
create function ops.support_ai_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = ops, public as $$
  select jsonb_build_object(
    'enabled',  c.enabled,
    'tripped',  coalesce(b.tripped_at is not null or b.spent_millicents >= c.daily_cap_millicents, false),
    'user_left', greatest(c.per_user_daily_exchanges - coalesce(u.exchanges, 0), 0),
    'model',    c.model)
  from ops.support_ai_config c
  left join ops.support_ai_budget b on b.day = ops.support_ai_today()
  left join ops.support_ai_user_day u on u.user_id = p_user and u.day = ops.support_ai_today();
$$;

-- Admission: every AI call must pass here BEFORE the provider is contacted.
-- Checks, in order: config enabled, circuit breaker (spend + in-flight
-- reservations + this call's worst case must fit under the cap, otherwise the
-- breaker TRIPS), per-user daily quota, conversation turn and token caps.
-- On success it reserves the call's worst-case cost and counts the exchange.
create function ops.support_ai_admit(p_user uuid, p_session uuid, p_conversation uuid, p_input_estimate integer)
returns jsonb
language plpgsql security definer set search_path = ops, public as $$
declare
  c      ops.support_ai_config;
  b      ops.support_ai_budget;
  u      ops.support_ai_user_day;
  conv   ops.support_ai_conversations;
  d      date := ops.support_ai_today();
  est_in integer := greatest(coalesce(p_input_estimate, 0), 1);
  max_out integer;
  reserve bigint;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  select * into c from ops.support_ai_config;
  if not c.enabled then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;

  insert into ops.support_ai_budget (day) values (d) on conflict do nothing;
  select * into b from ops.support_ai_budget where day = d for update;
  if b.tripped_at is not null or b.spent_millicents >= c.daily_cap_millicents then
    update ops.support_ai_budget set tripped_at = coalesce(tripped_at, now()) where day = d;
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  insert into ops.support_ai_user_day (user_id, day) values (p_user, d) on conflict do nothing;
  select * into u from ops.support_ai_user_day where user_id = p_user and day = d for update;
  if u.exchanges >= c.per_user_daily_exchanges then
    return jsonb_build_object('ok', false, 'reason', 'user_quota');
  end if;

  if p_conversation is null then
    insert into ops.support_ai_conversations (user_id, session_id) values (p_user, p_session)
    returning * into conv;
  else
    select * into conv from ops.support_ai_conversations where id = p_conversation for update;
    if not found or conv.user_id <> p_user then
      return jsonb_build_object('ok', false, 'reason', 'conversation');
    end if;
  end if;
  if conv.turns >= c.conversation_max_turns then
    return jsonb_build_object('ok', false, 'reason', 'turns', 'conversation_id', conv.id);
  end if;
  max_out := least(c.max_output_tokens, c.conversation_token_cap - est_in);
  if max_out < c.min_output_tokens then
    return jsonb_build_object('ok', false, 'reason', 'tokens', 'conversation_id', conv.id);
  end if;

  reserve := ops.support_ai_cost(est_in, max_out);
  if b.spent_millicents + b.reserved_millicents + reserve > c.daily_cap_millicents then
    update ops.support_ai_budget set tripped_at = coalesce(tripped_at, now()) where day = d;
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  update ops.support_ai_budget set reserved_millicents = reserved_millicents + reserve where day = d;
  update ops.support_ai_user_day set exchanges = exchanges + 1 where user_id = p_user and day = d;
  return jsonb_build_object('ok', true, 'conversation_id', conv.id, 'turn', conv.turns + 1,
                            'max_output_tokens', max_out, 'reservation_millicents', reserve,
                            'model', c.model, 'day', d);
end $$;

-- Settlement after the provider answered (or failed): release the reservation,
-- charge the real cost, trip the breaker if the day's spend reached the cap,
-- log the call, and append the exchange to the transcript.
create function ops.support_ai_settle(
  p_user uuid, p_conversation uuid, p_day date, p_reservation bigint, p_model text,
  p_input_tokens integer, p_output_tokens integer, p_outcome text, p_error text, p_latency_ms integer,
  p_question text, p_answer text
) returns jsonb
language plpgsql security definer set search_path = ops, public as $$
declare
  cost bigint := ops.support_ai_cost(p_input_tokens, p_output_tokens);
  cap  bigint := (select daily_cap_millicents from ops.support_ai_config);
  b    ops.support_ai_budget;
begin
  update ops.support_ai_budget
     set reserved_millicents = greatest(reserved_millicents - coalesce(p_reservation, 0), 0),
         spent_millicents    = spent_millicents + cost,
         calls               = calls + 1
   where day = coalesce(p_day, ops.support_ai_today())
  returning * into b;
  if b.spent_millicents >= cap and b.tripped_at is null then
    update ops.support_ai_budget set tripped_at = now() where day = b.day returning * into b;
  end if;

  insert into ops.support_ai_calls (user_id, conversation_id, model, outcome, input_tokens, output_tokens,
                                    cost_millicents, latency_ms, error)
  values (p_user, p_conversation, p_model, p_outcome, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
          cost, p_latency_ms, left(p_error, 500));

  if p_outcome = 'ok' then
    update ops.support_ai_conversations
       set turns = turns + 1, tokens = coalesce(p_input_tokens, 0) + coalesce(p_output_tokens, 0)
     where id = p_conversation;
    insert into ops.support_ai_messages (conversation_id, role, content)
    values (p_conversation, 'user', p_question), (p_conversation, 'assistant', p_answer);
  end if;
  return jsonb_build_object('cost_millicents', cost, 'tripped', b.tripped_at is not null);
end $$;

-- A cache hit is an exchange with no provider call: counts toward the user's
-- quota and the conversation's turns, costs nothing, and is logged.
create function ops.support_ai_record_cache_hit(
  p_user uuid, p_conversation uuid, p_hash text, p_question text, p_answer text, p_model text
) returns void
language plpgsql security definer set search_path = ops, public as $$
begin
  update ops.support_ai_cache set hits = hits + 1 where question_hash = p_hash;
  update ops.support_ai_conversations set turns = turns + 1 where id = p_conversation;
  insert into ops.support_ai_messages (conversation_id, role, content)
  values (p_conversation, 'user', p_question), (p_conversation, 'assistant', p_answer);
  insert into ops.support_ai_calls (user_id, conversation_id, model, outcome)
  values (p_user, p_conversation, p_model, 'cache_hit');
end $$;

-- Undo an admission that never reached the provider (e.g. cache hit decided
-- after admission is impossible by design, but a request that fails before the
-- call — bad key, network down before send — releases its hold here).
create function ops.support_ai_release(p_day date, p_reservation bigint) returns void
language sql security definer set search_path = ops as $$
  update ops.support_ai_budget
     set reserved_millicents = greatest(reserved_millicents - coalesce(p_reservation, 0), 0)
   where day = p_day;
$$;

create function ops.support_ai_purge() returns integer
language sql security definer set search_path = ops as $$
  with gone as (delete from ops.support_ai_cache where expires_at < now() returning 1)
  select count(*)::int from gone;
$$;
select cron.schedule('support-ai-cache-purge', '41 3 * * *', $$select ops.support_ai_purge()$$);

revoke all on ops.support_ai_config, ops.support_ai_budget, ops.support_ai_user_day, ops.support_ai_conversations,
              ops.support_ai_messages, ops.support_ai_cache, ops.support_ai_calls
  from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;
revoke execute on function ops.support_ai_today(), ops.support_ai_cost(integer, integer),
  ops.support_ai_status(uuid), ops.support_ai_admit(uuid, uuid, uuid, integer),
  ops.support_ai_settle(uuid, uuid, date, bigint, text, integer, integer, text, text, integer, text, text),
  ops.support_ai_record_cache_hit(uuid, uuid, text, text, text, text),
  ops.support_ai_release(date, bigint), ops.support_ai_purge()
  from public, anon, authenticated;
revoke execute on function private.support_escalate_is_terminal(), private.support_ticket_defaults()
  from public, anon, authenticated;

-- ============================================================================
-- SEED — the Tier 0 tree. Content needs Colin's review. Socratic: questions
-- first, then the fix with a button into the app. Tokens: {app} {moment}
-- {moments} {currency}. Settings routes (/settings/...) land with the Settings
-- screen (migration 022's work).
-- ============================================================================
insert into public.support_nodes (id, kind, prompt, body, fix_route, fix_label, human_category) values
('start', 'question', 'Hi. What''s going on?', 'Pick whatever is closest. We''ll work it out together.', null, null, null),

-- sign-in
('signin', 'question', 'Let''s get you in. Which part is stuck?', null, null, null, null),
('signin.code', 'question', 'When you asked for a code, did the screen move on to "Enter your code"?', null, null, null, null),
('signin.code.spam', 'answer', 'Then the code was sent. Let''s find it.',
 'Codes usually arrive within a minute, but some inboxes file them under Spam or Promotions. Search your email for "sign-in code". Nothing after two minutes? Go back and ask for a new one: each new code replaces the last. If you set a password, you can log in with that instead.',
 null, null, null),
('signin.code.error', 'answer', 'That usually means one of two things.',
 'Either the email address has a small typo, or you asked for several codes in a row and hit a short limit. Check the address letter by letter, wait a few minutes, then try once.',
 null, null, null),
('signin.expired', 'answer', 'Codes are short-lived on purpose.',
 'Only the newest code works, and only for a little while. Ask for a fresh one and use it straight away, on the same device.',
 null, null, null),
('signin.forgot', 'answer', 'You can set a new password yourself.',
 'On the log-in screen, tap "Forgot password?". We''ll email you a code, and you choose a new password.',
 '/forgot-password', 'Reset password', null),

-- video
('video', 'question', 'When you tapped Post, did you see a progress bar?', null, null, null, null),
('video.blocked', 'question', 'How long is the video?', null, null, null, null),
('video.toolong', 'answer', 'That''s the one. Reels can be up to 30 seconds.',
 'Trim it first (most phones: open the video, tap Edit, drag the ends), then pick it again in Create.',
 '/create', 'Open Create', null),
('video.toobig', 'answer', 'Then it''s probably the file size.',
 'Videos over 60 MB can''t be posted. 4K or high-frame-rate clips get big fast. Record at 1080p, or trim the clip, and try again.',
 '/create', 'Open Create', null),
('video.failed', 'answer', 'That''s almost always the connection dropping partway.',
 'Move somewhere with a stronger signal or join Wi-Fi, then tap Retry on the upload. You don''t have to start over.',
 '/create', 'Open Create', null),
('video.stutter', 'answer', 'Playback follows your connection.',
 'If videos pause or look soft, your signal is weak right now. Try Wi-Fi, or pause for a moment: the video keeps loading while paused.',
 null, null, null),

-- moments / friends
('moment.see', 'question', 'Are the two of you friends in {app}? Following each other doesn''t count.', null, null, null, null),
('moment.explain', 'answer', '{moments} are only shared between friends.',
 'Friends are people who sent a friend request and had it accepted. Following someone, or being each other''s regulars, doesn''t include {moments}. Send them a request: once they accept, you''ll see each other''s {moments}.',
 '/friends', 'Add friends', null),
('moment.see.friends', 'answer', 'Then it may not be there yet.',
 'A {moment} shows up once it finishes uploading, and people can delete their own. Open your {moments} and check again in a little while.',
 '/moments', 'Open {moments}', null),
('friends', 'question', 'What''s happening with friends?', null, null, null, null),
('friends.notallowed', 'answer', 'Some requests can''t be sent, and we don''t say why.',
 'People can limit who sends them requests, and some are blocked for safety. We keep the reason private to protect everyone. If you know them, ask them to send you a request instead: you''ll be able to accept it.',
 '/friends', 'Open friends', null),
('friends.vs.regulars', 'answer', 'They''re two different things.',
 'Friends are people you add and who accept: you see each other''s {moments}. Regulars happen on their own, from people who keep coming back to each other. A post shared with Regulars goes to your regulars, not automatically to your friends.',
 '/friends', 'Open friends', null),
('friends.remove', 'answer', 'You can remove a friend any time.',
 'Open your friends list, find them under Friends, and tap Remove. They aren''t notified.',
 '/friends', 'Open friends', null),

-- notifications
('notif', 'question', 'When your phone asked about notifications, did you allow them?', null, null, null, null),
('notif.permission', 'answer', 'Your phone decides first.',
 'Open your phone''s Settings, find {app}, and turn Notifications on. On the web there''s no push: new things show up inside the app instead.',
 null, null, null),
('notif.quiet', 'question', 'Are they missing mostly late at night or early in the morning?', null, null, null, null),
('notif.quiet.answer', 'answer', 'That''s quiet hours doing its job.',
 'By default nothing buzzes between 10pm and 8am your time. You can change the hours, or turn quiet hours off.',
 '/settings/notifications', 'Notification settings', null),
('notif.types', 'answer', 'Each kind of notification has its own switch.',
 'One of them may be off. Check the list and turn on the ones you want.',
 '/settings/notifications', 'Notification settings', null),

-- visibility
('visibility', 'answer', 'Every post has its own audience, chosen when you post.',
 'Public: anyone. Followers: people who follow you or keep coming back. Regulars: people you both keep coming back to. Only me: just you. {moments} are different: only friends you''ve added ever see them. Never strangers, never Discover.',
 '/settings/privacy', 'Privacy settings', null),

-- safety
('safety', 'question', 'Which is closest?', null, null, null, null),
('safety.block', 'answer', 'You don''t have to put up with it.',
 'Blocking stops someone from seeing your profile or contacting you, and they aren''t told. You can see and manage everyone you''ve blocked in Safety settings. If it keeps happening, tell us below and a person will look into it.',
 '/settings/safety', 'Safety settings', null),
('safety.report', 'answer', 'A person reviews every report.',
 'Tell us what you saw and where (whose profile, roughly when). Choose "Still stuck" below and write to a person.',
 null, null, null),
('safety.danger', 'answer', 'If someone is in danger right now, get help first.',
 'Contact local emergency services now (911 in the US). If it''s about someone harming themselves, the 988 Suicide & Crisis Lifeline can help: call or text 988 in the US. Then tell us, and a person will follow up.',
 null, null, null),

-- gifts and money
('money', 'question', 'Is this about how gifts work, or money that went wrong?', null, null, null, null),
('gifts.how', 'answer', 'Gifts are a preview for now.',
 'You can see how gifts will look, but nothing is charged and no {currency} change hands yet. When real gifts arrive, the price is shown before you pay, every time.',
 null, null, null),

-- account
('account', 'question', 'What would you like to do?', null, null, null, null),
('account.profile', 'answer', 'That''s all in Edit profile.',
 'Change your name, photo, bio and link there. Your username stays the same.',
 '/profile-edit', 'Edit profile', null),
('account.export', 'answer', 'You can ask for a copy of everything.',
 'Request an export in Account settings. We''ll prepare it and let you know when it''s ready.',
 '/settings/account', 'Account settings', null),
('account.delete', 'answer', 'You can delete your account yourself.',
 'It''s in Account settings, set apart at the bottom, and it asks you to confirm. If you might want your photos and videos, request an export first.',
 '/settings/account', 'Account settings', null),

-- endings
('done', 'answer', 'Glad that''s sorted.', 'If anything else comes up, you know where to find us.', null, null, null),
('still_stuck', 'escalate', 'Sorry that didn''t fix it.', 'Tell us what''s happening and a person will take a look.', null, null, null),
('escalate.money', 'escalate', 'Money questions always go to a person.',
 'Charges, refunds, payouts and splits are handled by our team, never by a bot. Tell us what happened.', null, null, 'money'),
('escalate.appeal', 'escalate', 'Appeals are always read by a person.',
 'Tell us which decision you''re appealing and why. Someone who wasn''t involved in the original decision will review it.', null, null, 'appeal'),
('escalate.legal', 'escalate', 'Legal and law-enforcement requests go straight to a person.',
 'Tell us who you are and what you need. We''ll reply from our team.', null, null, 'legal'),
('escalate.self_harm', 'escalate', 'You don''t have to go through this alone.',
 'If you''re thinking about hurting yourself, please reach out now.', null, null, 'self_harm');

insert into public.support_edges (from_node, to_node, label, sort) values
('start', 'signin',              'I can''t sign in', 10),
('start', 'video',               'A video won''t upload or play smoothly', 20),
('start', 'moment.see',          'I can''t see a friend''s {moment}', 30),
('start', 'friends',             'Friends and friend requests', 40),
('start', 'notif',               'Notifications aren''t arriving', 50),
('start', 'visibility',          'Who can see my posts?', 60),
('start', 'safety',              'Someone is bothering me', 70),
('start', 'money',               'Gifts and money', 80),
('start', 'account',             'My account and data', 90),
('start', 'escalate.self_harm',  'I''m going through something really hard', 100),
('start', 'escalate.appeal',     'Appeal a moderation decision', 110),
('start', 'escalate.legal',      'Legal or law enforcement', 120),
('start', 'still_stuck',         'Something else', 130),

('signin', 'signin.code',     'The code never arrives', 10),
('signin', 'signin.expired',  'It says the code is wrong or expired', 20),
('signin', 'signin.forgot',   'I forgot my password', 30),
('signin.code', 'signin.code.spam',  'Yes, but no email came', 10),
('signin.code', 'signin.code.error', 'No, I saw an error', 20),

('video', 'video.failed',  'Yes, but it stopped or failed', 10),
('video', 'video.blocked', 'No, it wouldn''t let me post', 20),
('video', 'video.stutter', 'It posted, but it stutters when I watch', 30),
('video.blocked', 'video.toolong', 'Longer than 30 seconds', 10),
('video.blocked', 'video.toobig',  '30 seconds or less', 20),

('moment.see', 'moment.see.friends', 'Yes, we''re friends', 10),
('moment.see', 'moment.explain',     'We follow each other', 20),
('moment.see', 'friends.vs.regulars', 'I''m not sure what counts', 30),

('friends', 'friends.notallowed',  'It says my request isn''t allowed', 10),
('friends', 'friends.vs.regulars', 'Friends vs regulars?', 20),
('friends', 'friends.remove',      'How do I remove a friend?', 30),

('notif', 'notif.quiet',      'Yes, I allowed them', 10),
('notif', 'notif.permission', 'No, or I''m not sure', 20),
('notif', 'notif.types',      'Only some kinds are missing', 30),
('notif.quiet', 'notif.quiet.answer', 'Yes, mostly then', 10),
('notif.quiet', 'notif.types',        'No, any time of day', 20),

('safety', 'safety.block',   'Someone keeps contacting me', 10),
('safety', 'safety.report',  'Something breaks the rules', 20),
('safety', 'safety.danger',  'Someone may be in danger', 30),
('safety', 'escalate.self_harm', 'I''m thinking about hurting myself', 40),

('money', 'gifts.how',      'How do gifts work?', 10),
('money', 'escalate.money', 'A charge, refund or payout problem', 20),

('account', 'account.profile', 'Change my name, photo or bio', 10),
('account', 'account.export',  'Get a copy of my data', 20),
('account', 'account.delete',  'Delete my account', 30);

-- Every answer (except the ending) resolves or escalates: two standard exits.
insert into public.support_edges (from_node, to_node, label, sort)
select n.id, 'done', 'That did it', 900 from public.support_nodes n
 where n.kind = 'answer' and n.id <> 'done';
insert into public.support_edges (from_node, to_node, label, sort)
select n.id, 'still_stuck', 'Still stuck', 910 from public.support_nodes n
 where n.kind = 'answer' and n.id <> 'done';
