-- ============================================================================
-- 003 — ROW LEVEL SECURITY, GUARDS, AND INVARIANT ENFORCEMENT
--
-- Deny by default: RLS is enabled on every table in `public`, and every client
-- write path is an explicit column grant plus an explicit policy.
--
-- Rules of this file:
--   * Money (brief §9) has NO client write path. The purchase/gift RPCs are not
--     in this milestone (preserved on branch later/money-rpcs).
--   * Age and safety rules (brief §7) are enforced here, in the database, via
--     triggers that run for every role (service role included), not in the app.
--   * No function a client can reach answers a question about SOMEONE ELSE:
--       - helpers that reveal another user's age, relationships, blocks or
--         memberships (public.is_adult, is_age_verified_adult, can_dm,
--         relationship_state, is_mutual, private.blocked_between,
--         private.member_of) are not executable by anon/authenticated;
--       - the helpers RLS policies call live in schema `private`, which the API
--         does not expose (config.toml: schemas = public, graphql_public), and
--         each of them answers only about the caller (auth.uid()).
--   * Guard failures that could otherwise reveal why (minor? blocked?
--     unverified? nonexistent?) raise one generic error per operation.
-- ============================================================================

-- ============================================================================
-- SCHEMA SUPPORT FOR POLICIES
-- ============================================================================

-- Moderator policies need a role. Not writable by clients (see column grants).
alter table users
  add column app_role text not null default 'user'
    check (app_role in ('user','moderator','admin'));

-- Creator terms (brief §6.4): at most one active version per user, and the
-- platform default (user_id null) counts as one user. v0.1's
-- unique (user_id, version) treats nulls as distinct, so it cannot protect the
-- default row; these indexes can.
create unique index creator_terms_user_version_uniq
  on creator_terms (user_id, version) nulls not distinct;
create unique index creator_terms_one_active
  on creator_terms (user_id) nulls not distinct
  where superseded_at is null;

-- One 'like' interaction per (actor, post): like/unlike/like must not inflate
-- the relationship signal.
create unique index interactions_one_like_per_post
  on interactions (actor_id, post_id) where kind = 'like';

-- Storage objects are resolved to their media_assets row by path.
create index media_provider_asset_idx
  on media_assets (provider_asset_id) where provider_asset_id is not null;

-- DM message requests (brief §7). There is deliberately NO body column: see
-- "MESSAGE REQUESTS" below for how the body is withheld until acceptance.
create table message_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references users(id) on delete cascade,
  recipient_id    uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index message_requests_one_pending
  on message_requests (sender_id, recipient_id) where status = 'pending';
create index message_requests_recipient_idx
  on message_requests (recipient_id, created_at desc);

-- ============================================================================
-- INTERNAL HELPERS (not executable by clients)
-- security definer so triggers/policy helpers can consult RLS-protected tables
-- without recursion. All pin search_path.
-- ============================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- 18+ by DOB AND verified by a provider (brief §7: live, receiving gifts).
create function public.is_age_verified_adult(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_adult(uid)
     and exists (select 1 from public.users u where u.id = uid and u.age_verified);
$$;

create function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Active (not left) member of a conversation.
create function private.member_of(conv uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = uid and left_at is null);
$$;

-- Post visibility on row values, for an explicit viewer:
--   author          → always (including deleted/expired)
--   everyone else   → not deleted, not expired, not blocked either way, and
--     public    → anyone (anon included)
--     followers → relationship_state(viewer, author) in ('returning','regular')
--     friends   → is_mutual(viewer, author)
--     private   → author only
create function private.post_visible_for(
  p_author uuid, p_visibility public.visibility, p_deleted_at timestamptz,
  p_expires_at timestamptz, p_viewer uuid
) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_viewer is not null and p_author = p_viewer then
    return true;
  end if;
  if p_deleted_at is not null
     or (p_expires_at is not null and p_expires_at <= now())
     or private.blocked_between(p_author, p_viewer) then
    return false;
  end if;
  return case p_visibility
    when 'public'    then true
    when 'followers' then p_viewer is not null
                          and coalesce(public.relationship_state(p_viewer, p_author)
                                       in ('returning','regular'), false)
    when 'friends'   then public.is_mutual(p_viewer, p_author)
    when 'private'   then false  -- author handled above
  end;
end $$;

-- DM permission (brief §7). Never across a block. Then:
--   * either side a minor → only when is_mutual(a, b);
--   * adult ↔ adult       → is_mutual(a, b) OR both are age-verified adults.
-- Hence an adult and an unconnected minor can never DM.
create function public.can_dm(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if a is null or b is null or a = b or private.blocked_between(a, b) then
    return false;
  end if;
  if not (public.is_adult(a) and public.is_adult(b)) then
    return public.is_mutual(a, b);
  end if;
  return public.is_mutual(a, b)
      or (public.is_age_verified_adult(a) and public.is_age_verified_adult(b));
end $$;

-- ============================================================================
-- POLICY HELPERS (executable by anon/authenticated; each answers only about
-- the caller, auth.uid(), so none is an oracle about other users)
-- ============================================================================

-- Is the caller blocked with `other` (either direction)?
create function private.blocked_with_me(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.blocked_between(auth.uid(), other);
$$;

-- Is the caller an active member of `conv`?
create function private.i_am_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.member_of(conv, auth.uid());
$$;

create function private.i_am_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and app_role in ('moderator','admin'));
$$;

-- Post visibility for the caller, from the row's own columns. posts_select uses
-- this (not a re-query of posts) so INSERT … RETURNING works for the author.
create function private.post_visible(
  p_author uuid, p_visibility public.visibility, p_deleted_at timestamptz, p_expires_at timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  select private.post_visible_for(p_author, p_visibility, p_deleted_at, p_expires_at, auth.uid());
$$;

-- Can the caller see post `p_post`? Looks the post up (for child tables).
create function private.post_id_visible(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select private.post_visible_for(p.author_id, p.visibility, p.deleted_at, p.expires_at, auth.uid())
     from public.posts p where p.id = p_post),
    false);
$$;

-- Can the caller see media asset `p_media`? The owner always; anyone else only
-- for ready, non-deleted media that is attached to a post they can see, or that
-- is the avatar of a profile they can see (not blocked).
create function private.media_visible(p_media uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.media_assets m
    where m.id = p_media
      and (m.owner_id = auth.uid()
           or (m.status = 'ready' and m.deleted_at is null
               and (exists (select 1
                            from public.post_media pm
                            join public.posts p on p.id = pm.post_id
                            where pm.media_id = m.id
                              and private.post_visible_for(p.author_id, p.visibility, p.deleted_at,
                                                           p.expires_at, auth.uid()))
                    or exists (select 1 from public.profiles pr
                               where pr.avatar_media_id = m.id
                                 and not private.blocked_between(pr.user_id, auth.uid()))))));
$$;

-- Can the caller read storage object `p_name` in bucket `media`? Only through
-- a media_assets row that points at it (provider_asset_id = object path) and
-- that the caller can see. (Uploaders read their own folder via the policy.)
create function private.media_object_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.media_assets m
    where m.provider_asset_id = p_name and private.media_visible(m.id));
$$;

-- May the caller join/chat in stream `p_stream`? Adult-only streams require the
-- caller to be an adult.
create function private.can_join_stream(p_stream uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.live_streams s
    where s.id = p_stream
      and (not s.is_adult_only or public.is_adult(auth.uid())));
$$;

-- Public, self-only post check kept for the app. For anon/authenticated JWTs a
-- p_viewer other than auth.uid() is answered as "no", so it cannot be used to
-- probe someone else's relationship with an author.
create function public.can_view_post(p_post uuid, p_viewer uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p public.posts%rowtype;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and p_viewer is distinct from auth.uid() then
    return false;
  end if;
  select * into p from public.posts where id = p_post;
  if not found then
    return false;
  end if;
  return private.post_visible_for(p.author_id, p.visibility, p.deleted_at, p.expires_at, p_viewer);
end $$;

-- ============================================================================
-- AUTH → users
-- Creates ONLY the public.users row. The profile is created by the app on first
-- login (brief §8.6). date_of_birth comes from signup metadata; the app requires
-- it, but a missing/empty value still creates the row (null DOB = not adult).
-- A present-but-malformed DOB raises, so signup fails loudly.
-- ============================================================================
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dob_text text := nullif(btrim(coalesce(new.raw_user_meta_data->>'date_of_birth', '')), '');
  dob date;
begin
  if dob_text is not null then
    begin
      dob := dob_text::date;
    exception when others then
      raise exception 'invalid_date_of_birth: %', dob_text using errcode = '22007';
    end;
  end if;
  insert into public.users (id, email, phone, date_of_birth)
  values (new.id, new.email, new.phone, dob);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- COUNTER TRIGGERS (security definer: they update rows the actor can't)
-- ============================================================================

-- post_count counts live (not soft-deleted) posts.
create function public.maintain_post_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.profiles set post_count = post_count + 1 where user_id = new.author_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.profiles set post_count = greatest(post_count - 1, 0) where user_id = old.author_id;
    end if;
    return old;
  end if;
  -- UPDATE OF deleted_at
  if old.deleted_at is null and new.deleted_at is not null then
    update public.profiles set post_count = greatest(post_count - 1, 0) where user_id = new.author_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.profiles set post_count = post_count + 1 where user_id = new.author_id;
  end if;  -- otherwise deleted_at state unchanged: nothing to do
  return new;
end $$;
create trigger posts_count after insert or delete or update of deleted_at on posts
  for each row execute function public.maintain_post_count();

create function public.maintain_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  end if;
  -- DELETE
  update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  return old;
end $$;
create trigger likes_count after insert or delete on likes
  for each row execute function public.maintain_like_count();

-- comment_count counts live (not soft-deleted) comments.
create function public.maintain_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  -- UPDATE OF deleted_at
  if old.deleted_at is null and new.deleted_at is not null then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return new;
end $$;
create trigger comments_count after insert or delete or update of deleted_at on comments
  for each row execute function public.maintain_comment_count();

-- ============================================================================
-- INTERACTIONS — written by the database on the user's behalf, never by a
-- client (brief §8.3, §8.9: a like writes both a likes row and an interactions
-- row). Self-interactions are skipped: interactions has check (actor <> subject).
-- ============================================================================
create function public.record_post_interaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  actor uuid;
  interaction_kind text;
begin
  if tg_table_name = 'likes' then
    actor := new.user_id;
    interaction_kind := 'like';
  elsif tg_table_name = 'comments' then
    actor := new.author_id;
    interaction_kind := 'comment';
  else
    raise exception 'record_post_interaction: unsupported table %', tg_table_name;
  end if;

  select p.author_id into author from public.posts p where p.id = new.post_id;
  if author is null then
    -- The FK on post_id makes this unreachable; fail loudly if it ever happens.
    raise exception 'record_post_interaction: post % not found', new.post_id;
  end if;
  if author = actor then
    return new;  -- self-like / self-comment: not a relationship signal
  end if;

  if interaction_kind = 'like' then
    -- At most one 'like' interaction per (actor, post): unlike/re-like is not a
    -- new relationship signal (interactions_one_like_per_post).
    insert into public.interactions (actor_id, subject_id, post_id, kind, occurred_at)
    values (actor, author, new.post_id, 'like', new.created_at)
    on conflict (actor_id, post_id) where kind = 'like' do nothing;
  else
    insert into public.interactions (actor_id, subject_id, post_id, kind, occurred_at)
    values (actor, author, new.post_id, interaction_kind, new.created_at);
  end if;
  return new;
end $$;
create trigger likes_record_interaction after insert on likes
  for each row execute function public.record_post_interaction();
create trigger comments_record_interaction after insert on comments
  for each row execute function public.record_post_interaction();

-- ============================================================================
-- CHILD-SAFETY AND ELIGIBILITY GUARDS (brief §7)
-- Triggers, not policies, so they bind the service role too.
-- ============================================================================

-- Live streaming requires an 18+ verified host.
create function public.require_verified_adult_host() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_age_verified_adult(new.host_id) then
    raise exception 'live_requires_verified_adult' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger live_streams_require_verified_adult
  before insert or update of host_id on live_streams
  for each row execute function public.require_verified_adult_host();

-- A message must be permitted between the sender and EVERY other active member
-- (group chats included). Also applies to edits of the body, so a sender who
-- lost DM permission (or left) cannot rewrite what others will read.
create function public.require_dm_permission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  other_member uuid;
begin
  if not private.member_of(new.conversation_id, new.sender_id) then
    raise exception 'dm_not_allowed' using errcode = 'P0001';
  end if;
  for other_member in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and left_at is null and user_id <> new.sender_id
  loop
    if not public.can_dm(new.sender_id, other_member) then
      raise exception 'dm_not_allowed' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger messages_require_dm_permission
  before insert or update of body on messages
  for each row execute function public.require_dm_permission();

-- Joining a conversation exposes its whole history. So, for every join or
-- re-join:
--   * a client adding someone else must itself be an ACTIVE member;
--   * the new member must be DM-able with EVERY user who has ever been a member
--     (left or not) and EVERY user who has ever sent a message there.
-- Without the second rule an adult could write alone, leave, and add a minor.
-- The one exception is an ACCEPTED message request for this conversation from
-- that user (see MESSAGE REQUESTS), which is only ever between two adults.
-- Every failure raises the same error, so the result cannot be used to learn
-- which rule (age, verification, block) refused it.
create function public.require_member_join_permission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adder uuid := auth.uid();
  other_user uuid;
begin
  -- Leaving (or staying left) is always allowed; only joining or re-joining is
  -- checked.
  if new.left_at is not null or (tg_op = 'UPDATE' and old.left_at is null) then
    return new;
  end if;
  if adder is not null and adder <> new.user_id
     and not private.member_of(new.conversation_id, adder) then
    raise exception 'member_join_not_allowed' using errcode = 'P0001';
  end if;
  for other_user in
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.user_id
    union
    select m.sender_id from public.messages m
    where m.conversation_id = new.conversation_id and m.sender_id <> new.user_id
  loop
    if not (public.can_dm(new.user_id, other_user)
            or exists (select 1 from public.message_requests r
                       where r.conversation_id = new.conversation_id
                         and r.sender_id = other_user
                         and r.recipient_id = new.user_id
                         and r.status = 'accepted'
                         and not private.blocked_between(other_user, new.user_id))) then
      raise exception 'member_join_not_allowed' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger conversation_members_require_join_permission
  before insert or update of left_at on conversation_members
  for each row execute function public.require_member_join_permission();

-- Receiving gifts requires 18+ verified + payout KYC (brief §7). gift_events has
-- no client write path at all; this binds the service role / future RPC too.
-- (Specific errors are fine here: only the service role can reach it.)
create function public.require_gift_recipient_eligible() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_age_verified_adult(new.recipient_id) then
    raise exception 'gift_recipient_not_verified_adult' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payout_accounts pa
                 where pa.user_id = new.recipient_id and pa.payouts_enabled) then
    raise exception 'gift_recipient_payouts_not_enabled' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger gift_events_require_eligible_recipient
  before insert on gift_events
  for each row execute function public.require_gift_recipient_eligible();

-- ============================================================================
-- MESSAGE REQUESTS (brief §7: "Message requests never expose body content")
--
-- Mechanism — how the body is withheld until acceptance:
--   1. message_requests has NO body column. The request row carries only who,
--      when, status, and an optional conversation_id.
--   2. A sender who wants to include a first message creates a conversation
--      with themselves as its ONLY member and writes the message there. The
--      recipient is not a member, and messages RLS is member-only, so no client
--      query by the recipient can return that body.
--   3. The recipient sees requests through the view message_requests_inbox
--      (id, sender_id, status, created_at — never a body) and may set status.
--   4. Only when the recipient sets status = 'accepted' does the database add
--      the recipient to the conversation (message_requests_on_accept). Declined
--      or pending requests never grant membership.
--   5. Requests exist only between two adults. A minor's only DM path is a
--      mutual relationship (brief §7), so no request can put a message in front
--      of a minor, and require_member_join_permission blocks every other route.
--
-- Every refusal to create (or accept) a request raises the SAME error,
-- 'request_not_allowed' — recipient a minor, blocked either way, nonexistent,
-- conversation not the sender's, recipient already a member — so a request
-- cannot be used as an age or block oracle.
-- ============================================================================
create function public.message_request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending'
       or not exists (select 1 from public.users u where u.id = new.recipient_id)
       or private.blocked_between(new.sender_id, new.recipient_id)
       or not (public.is_adult(new.sender_id) and public.is_adult(new.recipient_id))
       or (new.conversation_id is not null
           and (not exists (select 1 from public.conversations c
                            where c.id = new.conversation_id and c.created_by = new.sender_id)
                or private.member_of(new.conversation_id, new.recipient_id))) then
      raise exception 'request_not_allowed' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: only status may change, and only pending → accepted | declined.
  if (new.id, new.sender_id, new.recipient_id, new.conversation_id, new.created_at)
     is distinct from
     (old.id, old.sender_id, old.recipient_id, old.conversation_id, old.created_at) then
    raise exception 'message_request_immutable' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' or new.status not in ('accepted','declined') then
    raise exception 'message_request_invalid_transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;
  -- Accepting re-checks the pair; declining never does, so a request can
  -- always be refused.
  if new.status = 'accepted'
     and (private.blocked_between(new.sender_id, new.recipient_id)
          or not (public.is_adult(new.sender_id) and public.is_adult(new.recipient_id))) then
    raise exception 'request_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger message_requests_guard
  before insert or update on message_requests
  for each row execute function public.message_request_guard();

create function public.message_request_on_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' and new.conversation_id is not null then
    insert into public.conversation_members (conversation_id, user_id)
    values (new.conversation_id, new.recipient_id)
    on conflict (conversation_id, user_id) do update set left_at = null;
  end if;
  return new;
end $$;
create trigger message_requests_on_accept
  after update of status on message_requests
  for each row execute function public.message_request_on_accept();

-- ============================================================================
-- APPEND-ONLY ENFORCEMENT (brief §6.3)
-- v0.1's `do instead nothing` rules silently discard writes, and a rule rewrites
-- the statement before any trigger could see it. They are replaced by triggers
-- that RAISE, so a bug that tries to mutate money fails loudly.
-- ============================================================================
drop rule ledger_entries_no_update on ledger_entries;
drop rule ledger_entries_no_delete on ledger_entries;

create function public.reject_append_only_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'P0001';
end $$;

create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function public.reject_append_only_mutation();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function public.reject_append_only_mutation();
create trigger ledger_transactions_append_only before update or delete on ledger_transactions
  for each row execute function public.reject_append_only_mutation();
create trigger ledger_transactions_no_truncate before truncate on ledger_transactions
  for each statement execute function public.reject_append_only_mutation();
create trigger coin_purchases_append_only before update or delete on coin_purchases
  for each row execute function public.reject_append_only_mutation();
create trigger coin_purchases_no_truncate before truncate on coin_purchases
  for each statement execute function public.reject_append_only_mutation();
create trigger gift_events_append_only before update or delete on gift_events
  for each row execute function public.reject_append_only_mutation();
create trigger gift_events_no_truncate before truncate on gift_events
  for each statement execute function public.reject_append_only_mutation();

-- creator_terms (brief §6.4): the ONLY permitted mutation is superseded_at
-- null → value, with every other column unchanged.
create function public.creator_terms_guard_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.superseded_at is null
       and new.superseded_at is not null
       and (old.id, old.user_id, old.version, old.creator_share_bps, old.min_payout_cents,
            old.payout_delay_days, old.effective_from, old.summary, old.created_at)
           is not distinct from
           (new.id, new.user_id, new.version, new.creator_share_bps, new.min_payout_cents,
            new.payout_delay_days, new.effective_from, new.summary, new.created_at)
    then
      return new;
    end if;
    raise exception 'creator_terms is immutable: only superseded_at may be set, once'
      using errcode = 'P0001';
  end if;
  -- DELETE or TRUNCATE
  raise exception 'creator_terms is append-only: % is not permitted', tg_op
    using errcode = 'P0001';
end $$;
create trigger creator_terms_guard before update or delete on creator_terms
  for each row execute function public.creator_terms_guard_mutation();
create trigger creator_terms_no_truncate before truncate on creator_terms
  for each statement execute function public.creator_terms_guard_mutation();

-- Double-entry invariant, checked at COMMIT (deferred) so multi-row postings can
-- be inserted one entry at a time. For the entry's transaction:
--   * each entry's currency equals its account's currency;
--   * per currency, sum(debit) = sum(credit).
create function public.assert_ledger_txn_balanced() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bad_currency text;
begin
  if exists (
    select 1
    from public.ledger_entries e
    join public.ledger_accounts a on a.id = e.account_id
    where e.transaction_id = new.transaction_id and e.currency <> a.currency
  ) then
    raise exception 'ledger_currency_mismatch: transaction %', new.transaction_id
      using errcode = 'P0001';
  end if;

  select currency into bad_currency
  from public.ledger_entries
  where transaction_id = new.transaction_id
  group by currency
  having sum(case when side = 'debit'  then amount else 0 end)
      <> sum(case when side = 'credit' then amount else 0 end)
  limit 1;
  if found then
    raise exception 'ledger_unbalanced: transaction % currency %', new.transaction_id, bad_currency
      using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function public.assert_ledger_txn_balanced();

-- v0.1's ledger_balances is a plain view, which runs with the owner's rights and
-- would show every account's balance to anon. security_invoker makes it obey the
-- caller's RLS on ledger_entries.
alter view ledger_balances set (security_invoker = true);


-- ============================================================================
-- FUNCTION PRIVILEGES
-- Postgres grants EXECUTE to PUBLIC and Supabase to anon/authenticated by
-- default. Everything is revoked, then only the self-only policy helpers are
-- granted back.
-- ============================================================================
revoke execute on function public.is_adult(uuid)                    from public, anon, authenticated;
revoke execute on function public.is_age_verified_adult(uuid)       from public, anon, authenticated;
revoke execute on function public.can_dm(uuid, uuid)                from public, anon, authenticated;
revoke execute on function public.relationship_state(uuid, uuid)    from public, anon, authenticated;
revoke execute on function public.is_mutual(uuid, uuid)             from public, anon, authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant  execute on function private.blocked_with_me(uuid)            to anon, authenticated;
grant  execute on function private.i_am_member(uuid)                to anon, authenticated;
grant  execute on function private.i_am_moderator()                 to anon, authenticated;
grant  execute on function private.post_visible(uuid, public.visibility, timestamptz, timestamptz)
  to anon, authenticated;
grant  execute on function private.post_id_visible(uuid)            to anon, authenticated;
grant  execute on function private.media_visible(uuid)              to anon, authenticated;
grant  execute on function private.media_object_visible(text)       to anon, authenticated;
grant  execute on function private.can_join_stream(uuid)            to anon, authenticated;

revoke execute on function public.handle_new_auth_user()            from public, anon, authenticated;
revoke execute on function public.maintain_post_count()             from public, anon, authenticated;
revoke execute on function public.maintain_like_count()             from public, anon, authenticated;
revoke execute on function public.maintain_comment_count()          from public, anon, authenticated;
revoke execute on function public.record_post_interaction()         from public, anon, authenticated;
revoke execute on function public.require_verified_adult_host()     from public, anon, authenticated;
revoke execute on function public.require_dm_permission()           from public, anon, authenticated;
revoke execute on function public.require_member_join_permission()  from public, anon, authenticated;
revoke execute on function public.require_gift_recipient_eligible() from public, anon, authenticated;
revoke execute on function public.message_request_guard()           from public, anon, authenticated;
revoke execute on function public.message_request_on_accept()       from public, anon, authenticated;
revoke execute on function public.reject_append_only_mutation()     from public, anon, authenticated;
revoke execute on function public.creator_terms_guard_mutation()    from public, anon, authenticated;
revoke execute on function public.assert_ledger_txn_balanced()      from public, anon, authenticated;
-- public.can_view_post stays executable: it answers only for the caller.

-- ============================================================================
-- ROW LEVEL SECURITY — every table in public.
-- ============================================================================
alter table users                  enable row level security;
alter table profiles               enable row level security;
alter table interactions           enable row level security;
alter table relationships          enable row level security;
alter table friendships            enable row level security;
alter table blocks                 enable row level security;
alter table media_assets           enable row level security;
alter table posts                  enable row level security;
alter table post_media             enable row level security;
alter table likes                  enable row level security;
alter table comments               enable row level security;
alter table reach_events           enable row level security;
alter table post_daily_stats       enable row level security;
alter table conversations          enable row level security;
alter table conversation_members   enable row level security;
alter table messages               enable row level security;
alter table message_requests       enable row level security;
alter table live_streams           enable row level security;
alter table live_participants      enable row level security;
alter table live_chat_messages     enable row level security;
alter table coin_products          enable row level security;
alter table coin_purchases         enable row level security;
alter table ledger_accounts        enable row level security;
alter table ledger_transactions    enable row level security;
alter table ledger_entries         enable row level security;
alter table creator_terms          enable row level security;
alter table gift_catalog           enable row level security;
alter table gift_events            enable row level security;
alter table payout_accounts        enable row level security;
alter table payouts                enable row level security;
alter table reports                enable row level security;
alter table moderation_decisions   enable row level security;
alter table appeals                enable row level security;
alter table devices                enable row level security;
alter table notifications          enable row level security;

-- ============================================================================
-- COLUMN PRIVILEGES
-- Clients may not write counters, verification flags, roles, DOB, URLs the
-- viewer's device would fetch, or any moderation outcome. Those move only via
-- triggers / service role.
-- ============================================================================
revoke insert, update on users from anon, authenticated;
grant  update (phone, country_code) on users to authenticated;

revoke insert, update on profiles from anon, authenticated;
grant  insert (user_id, username, display_name, bio, avatar_media_id, link_url)
  on profiles to authenticated;
grant  update (username, display_name, bio, avatar_media_id, link_url)
  on profiles to authenticated;

-- posts: counters are not readable by clients (no public counts); removal is a
-- soft delete (update deleted_at), never a hard delete.
revoke select, insert, update, delete on posts from anon, authenticated;
grant  select (id, author_id, kind, caption, visibility, expires_at, allow_comments,
               allow_gifts, created_at, deleted_at)
  on posts to anon, authenticated;
grant  insert (id, author_id, kind, caption, visibility, expires_at, allow_comments, allow_gifts)
  on posts to authenticated;
grant  update (caption, visibility, expires_at, allow_comments, allow_gifts, deleted_at)
  on posts to authenticated;

-- media_assets: playback_url / thumbnail_url are not client-writable (a client
-- could otherwise make every viewer's device fetch an arbitrary URL). Images
-- are addressed by provider_asset_id = storage path and served by signed URL.
revoke insert, update on media_assets from anon, authenticated;
grant  insert (id, owner_id, kind, status, provider, provider_asset_id,
               duration_ms, width, height, bytes, content_hash)
  on media_assets to authenticated;
grant  update (status, duration_ms, width, height, bytes, content_hash, deleted_at)
  on media_assets to authenticated;

revoke insert, update on post_media from anon, authenticated;
grant  insert (post_id, media_id, position) on post_media to authenticated;

-- likes: clients only ever read their own ("did I like this?").
revoke select, insert, update on likes from anon, authenticated;
grant  select on likes to authenticated;
grant  insert (post_id, user_id) on likes to authenticated;

revoke insert, update on comments from anon, authenticated;
grant  insert (id, post_id, author_id, parent_id, body) on comments to authenticated;
grant  update (body, deleted_at) on comments to authenticated;

revoke insert, update on friendships from anon, authenticated;
grant  insert (requester_id, addressee_id) on friendships to authenticated;
grant  update (status, responded_at) on friendships to authenticated;

revoke insert, update on conversations from anon, authenticated;
grant  insert (id, is_group, title, created_by) on conversations to authenticated;
grant  update (title) on conversations to authenticated;

revoke insert, update on conversation_members from anon, authenticated;
grant  insert (conversation_id, user_id) on conversation_members to authenticated;
grant  update (last_read_at, muted_until, left_at) on conversation_members to authenticated;

revoke insert, update on messages from anon, authenticated;
grant  insert (id, conversation_id, sender_id, body, media_id, shared_post_id, reply_to_id)
  on messages to authenticated;
grant  update (body, edited_at, deleted_at) on messages to authenticated;

revoke all on message_requests from anon, authenticated;
grant  select on message_requests to authenticated;
grant  insert (id, sender_id, recipient_id, conversation_id) on message_requests to authenticated;
grant  update (status) on message_requests to authenticated;

-- live_streams: ingest_url is the host's stream key. It is never readable by a
-- client; it is issued to the host by server-side provisioning (service role).
revoke select, insert, update on live_streams from anon, authenticated;
grant  select (id, host_id, title, status, provider, provider_room_id, playback_url,
               recording_media_id, is_adult_only, scheduled_for, started_at, ended_at,
               peak_viewers, total_viewers, created_at)
  on live_streams to anon, authenticated;
grant  insert (id, host_id, title, provider, is_adult_only, scheduled_for)
  on live_streams to authenticated;
grant  update (title, is_adult_only, scheduled_for) on live_streams to authenticated;

revoke insert, update on live_participants from anon, authenticated;
grant  insert (stream_id, user_id) on live_participants to authenticated;
grant  update (left_at) on live_participants to authenticated;

revoke insert, update on live_chat_messages from anon, authenticated;
grant  insert (stream_id, user_id, body) on live_chat_messages to authenticated;
grant  update (deleted_at) on live_chat_messages to authenticated;

-- appeals: the subject files a statement; only moderators record the outcome.
revoke insert, update on appeals from anon, authenticated;
grant  insert (id, decision_id, user_id, statement) on appeals to authenticated;
grant  update (outcome, resolved_at, reviewer_id) on appeals to authenticated;

-- interactions: NO client privileges of any kind (brief §8.3). Rows come only
-- from the security-definer triggers above or the service role.
revoke all on interactions from anon, authenticated;
revoke all on sequence interactions_id_seq from anon, authenticated;

-- relationships: read-only to the two parties; written only by the recompute job
-- (service role).
revoke insert, update, delete, truncate on relationships from anon, authenticated;

-- reach_events / post_daily_stats: no client writes at all.
revoke insert, update, delete, truncate on reach_events, post_daily_stats from anon, authenticated;

-- Money (brief §8.3, §9): no client write path at all.
revoke insert, update, delete, truncate on
  coin_products, coin_purchases, ledger_accounts, ledger_transactions, ledger_entries,
  creator_terms, gift_catalog, gift_events, payout_accounts, payouts
  from anon, authenticated;

-- ============================================================================
-- POLICIES
-- Every policy decides from the row's own columns or a self-only helper, so
-- INSERT … RETURNING (supabase-js `.insert().select()`) works for the author.
-- ============================================================================

-- users: own row only (DOB of others is private).
create policy users_select_own on users for select to authenticated
  using (id = (select auth.uid()));
create policy users_update_own on users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- profiles: public read except across a block; create and edit your own only.
create policy profiles_select on profiles for select to anon, authenticated
  using (not private.blocked_with_me(user_id));
create policy profiles_insert_own on profiles for insert to authenticated
  with check (user_id = (select auth.uid())
              and (avatar_media_id is null
                   or exists (select 1 from media_assets m
                              where m.id = avatar_media_id and m.owner_id = (select auth.uid()))));
create policy profiles_update_own on profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (avatar_media_id is null
                   or exists (select 1 from media_assets m
                              where m.id = avatar_media_id and m.owner_id = (select auth.uid()))));

-- Safe public projection: no DOB, no email, no counts of any kind (brief §6.7).
-- Inherits profiles RLS.
create view public_profiles with (security_invoker = true) as
select user_id, username, display_name, bio, avatar_media_id, link_url,
       is_creator, is_verified, updated_at
from profiles;
grant select on public_profiles to anon, authenticated;

-- interactions: RLS on, no policies, no privileges → invisible to clients.

-- relationships: the two parties may read; nobody writes from a client.
create policy relationships_select_party on relationships for select to authenticated
  using ((select auth.uid()) in (actor_id, subject_id));

-- friendships: the two parties read; the requester creates a pending request
-- and may withdraw it; only the addressee answers it.
create policy friendships_select on friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on friendships for insert to authenticated
  with check (requester_id = (select auth.uid())
              and status = 'pending'
              and not private.blocked_with_me(addressee_id));
create policy friendships_update_addressee on friendships for update to authenticated
  using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()));
create policy friendships_delete on friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- blocks: own rows only (the blocked party never learns of the block).
create policy blocks_own on blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- media_assets: the owner, or a viewer of a post/profile that uses it. A client
-- may only register media under its own storage folder.
create policy media_select on media_assets for select to anon, authenticated
  using (owner_id = (select auth.uid()) or private.media_visible(id));
create policy media_insert_own on media_assets for insert to authenticated
  with check (owner_id = (select auth.uid())
              and provider_asset_id is not null
              and starts_with(provider_asset_id, (select auth.uid())::text || '/'));
create policy media_update_own on media_assets for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- posts: visibility from the row's own columns; authors insert/update/soft-delete
-- their own.
create policy posts_select on posts for select to anon, authenticated
  using (private.post_visible(author_id, visibility, deleted_at, expires_at));
create policy posts_insert_own on posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy posts_update_own on posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

-- post_media: attach only your own media to your own post.
create policy post_media_select on post_media for select to anon, authenticated
  using (private.post_id_visible(post_id));
create policy post_media_insert_own on post_media for insert to authenticated
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid()))
              and exists (select 1 from media_assets m where m.id = media_id and m.owner_id = (select auth.uid())));
create policy post_media_delete_own on post_media for delete to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- likes: you read, write and delete only your own, on posts you can view.
create policy likes_select_own on likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy likes_insert_own on likes for insert to authenticated
  with check (user_id = (select auth.uid()) and private.post_id_visible(post_id));
create policy likes_delete_own on likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on comments for select to anon, authenticated
  using (private.post_id_visible(post_id));
create policy comments_insert_own on comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and private.post_id_visible(post_id)
              and exists (select 1 from posts p where p.id = post_id and p.allow_comments));
create policy comments_update_own on comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy comments_delete_own on comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- reach_events / post_daily_stats: the post's author and moderators only
-- (brief §6.2: readable by the affected creator).
create policy reach_events_select on reach_events for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid()))
         or private.i_am_moderator());
create policy post_daily_stats_select on post_daily_stats for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = (select auth.uid()))
         or private.i_am_moderator());

-- conversations / members / messages: members only. Message sending and body
-- edits are gated by messages_require_dm_permission; joining by
-- conversation_members_require_join_permission.
create policy conversations_select on conversations for select to authenticated
  using (private.i_am_member(id) or created_by = (select auth.uid()));
create policy conversations_insert on conversations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy conversations_update on conversations for update to authenticated
  using (private.i_am_member(id)) with check (private.i_am_member(id));

create policy conversation_members_select on conversation_members for select to authenticated
  using (private.i_am_member(conversation_id));
-- The conversation creator adds members (including themself).
create policy conversation_members_insert on conversation_members for insert to authenticated
  with check (exists (select 1 from conversations c
                      where c.id = conversation_id and c.created_by = (select auth.uid())));
create policy conversation_members_update_own on conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy messages_select on messages for select to authenticated
  using (private.i_am_member(conversation_id));
create policy messages_insert_own on messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.i_am_member(conversation_id));
create policy messages_update_own on messages for update to authenticated
  using (sender_id = (select auth.uid()) and private.i_am_member(conversation_id))
  with check (sender_id = (select auth.uid()) and private.i_am_member(conversation_id));

-- message_requests: both parties can see the row (it has no body); the sender
-- inserts as themselves; only the recipient changes status. Recipients list
-- their requests through message_requests_inbox.
create policy message_requests_select_party on message_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy message_requests_insert_sender on message_requests for insert to authenticated
  with check (sender_id = (select auth.uid()));
create policy message_requests_update_recipient on message_requests for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create view message_requests_inbox with (security_invoker = true) as
select id, sender_id, status, created_at
from message_requests
where recipient_id = (select auth.uid());
revoke all on message_requests_inbox from anon, authenticated;
grant select on message_requests_inbox to authenticated;

-- live: readable (minus ingest_url, see grants); host manages own stream.
-- INSERT is also gated by live_streams_require_verified_adult. Joining and
-- chatting respect is_adult_only.
create policy live_streams_select on live_streams for select to anon, authenticated
  using (true);
create policy live_streams_insert_own on live_streams for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy live_streams_update_own on live_streams for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy live_streams_delete_own on live_streams for delete to authenticated
  using (host_id = (select auth.uid()));

create policy live_participants_select on live_participants for select to anon, authenticated
  using (true);
create policy live_participants_insert_own on live_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_join_stream(stream_id));
create policy live_participants_update_own on live_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy live_chat_select on live_chat_messages for select to anon, authenticated
  using (true);
create policy live_chat_insert_own on live_chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_join_stream(stream_id));
create policy live_chat_update_own on live_chat_messages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Money: SELECT only, by owner. No write policies exist (and no privileges).
create policy coin_products_select on coin_products for select to anon, authenticated
  using (true);
create policy gift_catalog_select on gift_catalog for select to anon, authenticated
  using (true);
create policy coin_purchases_select_own on coin_purchases for select to authenticated
  using (user_id = (select auth.uid()));
create policy ledger_accounts_select_own on ledger_accounts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy ledger_entries_select_own on ledger_entries for select to authenticated
  using (exists (select 1 from ledger_accounts a
                 where a.id = account_id and a.owner_id = (select auth.uid())));
create policy ledger_transactions_select_own on ledger_transactions for select to authenticated
  using (exists (select 1 from ledger_entries e
                 join ledger_accounts a on a.id = e.account_id
                 where e.transaction_id = ledger_transactions.id
                   and a.owner_id = (select auth.uid())));
create policy creator_terms_select on creator_terms for select to anon, authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy gift_events_select_party on gift_events for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy payout_accounts_select_own on payout_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy payouts_select_own on payouts for select to authenticated
  using (user_id = (select auth.uid()));

-- reports: file as yourself, see your own; moderators see and work the queue.
create policy reports_insert_own on reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy reports_select on reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.i_am_moderator());
create policy reports_update_moderator on reports for update to authenticated
  using (private.i_am_moderator()) with check (private.i_am_moderator());

-- moderation_decisions: subject reads own; moderators do everything.
create policy moderation_decisions_select on moderation_decisions for select to authenticated
  using (subject_user_id = (select auth.uid()) or private.i_am_moderator());
create policy moderation_decisions_moderator on moderation_decisions for all to authenticated
  using (private.i_am_moderator()) with check (private.i_am_moderator());

-- appeals: subject files and reads own; moderators read and record outcomes.
create policy appeals_insert_own on appeals for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from moderation_decisions d
                          where d.id = decision_id and d.subject_user_id = (select auth.uid())));
create policy appeals_select on appeals for select to authenticated
  using (user_id = (select auth.uid()) or private.i_am_moderator());
create policy appeals_update_moderator on appeals for update to authenticated
  using (private.i_am_moderator()) with check (private.i_am_moderator());

-- notifications / devices: own rows only.
create policy devices_own on devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own on notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================================
-- STORAGE — bucket `media` is PRIVATE. Clients read objects only through
-- signed URLs (createSignedUrl), and signing requires SELECT on the object:
--   * your own folder `<auth.uid()>/...` always;
--   * anyone else's object only if a media_assets row with
--     provider_asset_id = object path is visible to you (private.media_visible:
--     attached to a post you can see, or a visible profile's avatar).
-- Uploads/updates/deletes: your own folder only.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = false;

create policy media_read_visible on storage.objects for select to anon, authenticated
  using (bucket_id = 'media'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or private.media_object_visible(name)));
create policy media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================================
-- PLATFORM DEFAULT CREATOR TERMS (user_id null, version 1)
-- Lives in a migration so every environment (including `db push` to
-- production) has platform terms. Idempotent via creator_terms_user_version_uniq.
-- ============================================================================
insert into creator_terms (user_id, version, creator_share_bps, min_payout_cents,
                           payout_delay_days, effective_from, summary)
values (
  null, 1, 7000, 2000, 7, now(),
  'You keep 70% of what remains after Apple or Google takes their 30% app store '
  'fee, which we do not control and cannot waive. Every gift you receive shows '
  'all three numbers: what the sender paid, what the app store took, and what '
  'reached you. Payouts run weekly once your balance clears $20. These terms '
  'cannot be changed retroactively — a rate change creates a new version with a '
  'future effective date, and everything earned before then settles at the old rate.'
)
on conflict do nothing;
