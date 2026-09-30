-- ============================================================================
-- 010 — DM initiation rules, request-acceptance opacity, minor-thread limits,
--       media immutability, no TRUNCATE for clients.
--
-- Everything here is enforced in the database (RLS, column grants, triggers).
-- None of it relies on the app.
--
-- ----------------------------------------------------------------------------
-- A. WHO MAY START A DM (Colin's decision, 2026-09-29; replaces brief §7 and
--    003's can_dm)
-- ----------------------------------------------------------------------------
--   Direction                                   Rule
--   minor → anyone                              allowed (a message request unless connected)
--   adult → adult                               allowed (a message request unless connected)
--   adult → unconnected minor                   refused ('request_not_allowed' /
--                                               'member_join_not_allowed' / 'dm_not_allowed')
--   adult replying in a thread a minor started  allowed, for as long as the thread lives
--   anything across a block, either direction   refused
--
--   "Connected" = public.is_mutual(a, b). "A thread a minor started" =
--   conversations.initiator_was_minor, with conversations.initiated_by the
--   minor. Both are set by a trigger when the conversation is created, from
--   created_by (the person who sends the first message or request), and can
--   never change afterwards. Clients have no grant on either column.
--
--   How a thread comes to exist:
--     * DIRECT: the creator adds someone they are connected (mutual) with.
--       public.can_dm now means exactly this: not blocked and mutual.
--     * REQUEST: anyone else. The sender creates a conversation with only
--       themself in it, writes the first message(s) there, and files a
--       message_requests row pointing at it. The recipient joins only by
--       accepting. A request thread stays between those two people: nobody
--       else can ever be added to it.
--
--   Sending a message (require_dm_permission) checks the sender against every
--   other participant (see private.may_message). Joining a conversation
--   (require_member_join_permission) checks the joiner against everyone who
--   has ever been in it or written in it (see private.may_share_thread),
--   because joining exposes the whole history.
--
-- ----------------------------------------------------------------------------
-- B. ACCEPTANCE OPACITY — the sender must never learn whether a request was
--    accepted, except by a reply arriving
-- ----------------------------------------------------------------------------
--   What the sender S can reach, and why each is identical for pending /
--   accepted / declined (R = recipient, C = the request's conversation):
--
--   message_requests      S has SELECT on (id, sender_id, recipient_id,
--                         conversation_id, created_at) only. `status` is not
--                         granted, so S cannot read it (42501 in every state).
--                         Only the recipient reads status, through
--                         message_requests_inbox (owner-rights view filtered to
--                         recipient_id = auth.uid()).
--   re-requesting         One request per (sender, recipient), EVER, whatever
--                         its status (was: one PENDING, which answered "is it
--                         still pending?" through a unique violation). A second
--                         request raises 'request_not_allowed' in every state,
--                         and the guard checks that before anything else.
--   conversation_members  SELECT policy is now "your own rows only". Nobody
--                         reads another member's row, so R's joined_at,
--                         last_read_at, muted_until and left_at are invisible
--                         to everyone but R.
--   conversation_roster   Owner-rights view listing who is in a conversation:
--                         every member row (left or not) PLUS every request
--                         sender/recipient for it. R is listed to S from the
--                         moment the request exists, so accepting (or leaving)
--                         changes nothing S sees.
--   conversations         S sees C in every state (creator). The minor flags
--                         are computed when the request is FILED (from S and
--                         R), so R joining on acceptance never changes them.
--                         Title edits are now creator-only, so R cannot
--                         signal acceptance by renaming C.
--   messages              S sees R's messages only once R writes one. That is
--                         the one intended signal.
--   sending more          require_dm_permission checks S against "active
--                         members ∪ request parties", which is {R} in every
--                         state, so the answer (and the work done) does not
--                         depend on whether R has joined. A block by R refuses
--                         S in every state alike.
--   adding members        Nobody but R (via acceptance) can be added to a
--                         request thread, and a client adding SOMEONE ELSE is
--                         refused before any status is read. S adding R is
--                         therefore 'member_join_not_allowed' in every state
--                         (previously: that error when pending, a primary-key
--                         violation when accepted).
--   leaving / rejoining   The rejoin check treats "S filed a request to R in C"
--                         as enough for S to be in C with R, whatever its
--                         status, so S's rejoin is decided identically.
--   updating the request  The update policy is recipient-only; S's UPDATE hits
--                         0 rows in every state (and a WHERE on status is 42501).
--
--   Timing: no function S can trigger reads message_requests.status or
--   branches on it; the guards that do read it run only for the recipient's
--   own accept (and for the recipient's own rejoin). The residual difference is
--   physical: after acceptance, index scans over C's conversation_members see
--   one more row (R's), which RLS then filters out. That is a sub-microsecond
--   difference far below network jitter; closing it would mean storing R's
--   membership somewhere S's queries never touch, which is not worth the
--   complexity now. Noted as a known residual.
--
--   Blocks: blocking keeps its existing, OBSERVABLE semantics for the blocked
--   person (their sends raise 'dm_not_allowed', the blocker's profile vanishes
--   from public_profiles). That is deliberate: a block must actually stop
--   delivery, and delivery can't be stopped silently without also storing
--   messages nobody will read. But a block is equally observable whether or
--   not the request had been accepted, so it reveals nothing about acceptance.
--   Declining is never observable. Declined looks like pending forever.
--
--   Future code must keep this: never notify the sender on accept/decline,
--   never expose status or joined_at to the sender, never let a recipient's
--   read receipts reach the sender.
--
-- ----------------------------------------------------------------------------
-- C. THREADS WITH A MINOR IN THEM (conversations.has_minor)
-- ----------------------------------------------------------------------------
--   has_minor is set when anyone who is, or has been, a participant is under
--   18: creator at creation, any member join, the request recipient when a
--   request is filed, and anyone whose DOB is corrected. It is STICKY (never
--   cleared), and with it:
--     * moderation_sensitivity = 'elevated' (for the classifier once
--       moderation ships);
--     * retention_class = 'extended';
--     * messages may not carry media_id or shared_post_id
--       → 'minor_thread_no_media' (23514);
--     * message bodies may not contain links → 'minor_thread_no_links' (23514),
--       see private.body_has_link for the exact patterns;
--     * a minor cannot join a thread whose history already holds media or links.
--
--   Retention (intended durations; no purge job is built here):
--     standard  — a soft-deleted message is purged 90 days after deleted_at.
--     extended  — messages are kept 2 years after deleted_at (or after the
--                 thread's last activity), for safety review. Clients can
--                 never hard-delete a message in any thread (DELETE is
--                 revoked); in extended threads a trigger additionally refuses
--                 DELETE from anon/authenticated/service_role unless the purge
--                 job sets app.retention_purge = 'on'. Every body edit in an
--                 extended thread is copied to private.message_body_history,
--                 so neither edits nor soft deletes destroy what was said.
--     Known gap: deleting a user account cascades (messages.sender_id ON
--     DELETE CASCADE) as the table owner and does remove their messages.
--     Account deletion should anonymise instead — follow-up.
--
-- ----------------------------------------------------------------------------
-- D. HARDENING
-- ----------------------------------------------------------------------------
--   1. Media immutability. Correction to 007's header, which implied the
--      30-second cap was enforced: what 007 enforces is the CLIENT-REPORTED
--      duration_ms. A modified client can upload a 10-minute file and report
--      29 000 ms. Enforcing the true duration needs a server-side probe of the
--      uploaded file (FOLLOW-UP, not built: an Edge Function triggered on
--      upload that ffprobes the object, writes duration_ms/status with the
--      service role, and rejects/purges files over 30 500 ms). What this
--      migration does close:
--        (a) a storage object referenced by any media_assets.provider_asset_id
--            or poster_path is immutable to clients: no UPDATE, no upsert, no
--            DELETE, no re-upload at that path. (Owners can still delete an
--            unattached orphan upload.) Removal of attached media is only by
--            soft-deleting the media row; the object is purged server-side.
--        (b) clients can no longer UPDATE media_assets.status or duration_ms
--            (set once at INSERT), and cannot clear or move deleted_at once set
--            → 'media_deletion_is_final' (23514).
--   2. TRUNCATE is revoked from anon/authenticated on every table in public,
--      and from the default privileges for tables created later.
-- ============================================================================


-- ============================================================================
-- SCHEMA
-- ============================================================================
alter table conversations
  add column initiated_by           uuid references users(id) on delete set null,
  add column initiator_was_minor    boolean not null default false,
  add column has_minor              boolean not null default false,
  add column moderation_sensitivity text not null default 'standard'
    check (moderation_sensitivity in ('standard','elevated')),
  add column retention_class        text not null default 'standard'
    check (retention_class in ('standard','extended'));

-- One request per (sender, recipient), ever. See B, "re-requesting".
drop index message_requests_one_pending;
create unique index message_requests_one_per_pair
  on message_requests (sender_id, recipient_id);
create index message_requests_conversation_idx
  on message_requests (conversation_id) where conversation_id is not null;

-- Server-side copy of every body a message had in an extended-retention
-- thread before it was edited. Not reachable through the API.
create table private.message_body_history (
  id              bigserial primary key,
  message_id      uuid not null,
  conversation_id uuid not null,
  sender_id       uuid not null,
  body            text,
  replaced_at     timestamptz not null default now()
);
alter table private.message_body_history enable row level security;
revoke all on private.message_body_history from public, anon, authenticated;
revoke all on sequence private.message_body_history_id_seq from public, anon, authenticated;


-- ============================================================================
-- RULE HELPERS (internal: not executable by clients)
-- ============================================================================

-- Everyone who is or has been part of `c`: member rows (left or not), anyone
-- who has written in it, and both parties of any request that points at it.
create function private.thread_participants(c uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id   from public.conversation_members where conversation_id = c
  union
  select sender_id from public.messages             where conversation_id = c
  union
  select sender_id    from public.message_requests  where conversation_id = c
  union
  select recipient_id from public.message_requests  where conversation_id = c;
$$;

-- May `s` file a message request to `r`? (Age rule only; blocks and the rest
-- are checked by the request guard.) Minors may request anyone; adults may
-- request adults, or a minor they are connected with.
create function private.may_request(s uuid, r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_adult(s) or public.is_adult(r) or public.is_mutual(s, r);
$$;

-- May `s` send a message that `r` will read, in conversation `c`?
--   never across a block; otherwise
--   minor sender → anyone | adult → adult | adult → connected minor |
--   adult → the minor who started this thread.
create function private.may_message(c uuid, s uuid, r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not private.blocked_between(s, r)
     and (   not public.is_adult(s)
          or public.is_adult(r)
          or public.is_mutual(s, r)
          or exists (select 1 from public.conversations cv
                     where cv.id = c and cv.initiator_was_minor and cv.initiated_by = r));
$$;

-- May `u` be in conversation `c` together with `o` (u is joining; o is any
-- past or present participant)? Never across a block; otherwise when
--   connected, or both adults, or
--   u filed a request to o in c (u is the sender (re)joining their own
--     request thread — decided WITHOUT reading the request's status, see B), or
--   o filed a request to u in c that u has ACCEPTED (u is the recipient
--     joining; runs only on the recipient's own action).
-- The age rule (private.may_request) is re-applied on both request branches,
-- so a later DOB correction can't smuggle an adult → minor thread through.
create function private.may_share_thread(c uuid, u uuid, o uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if private.blocked_between(u, o) then
    return false;
  end if;
  if public.is_mutual(u, o) or (public.is_adult(u) and public.is_adult(o)) then
    return true;
  end if;
  if exists (select 1 from public.message_requests r
             where r.conversation_id = c and r.sender_id = u and r.recipient_id = o) then
    return private.may_request(u, o);
  end if;
  return exists (select 1 from public.message_requests r
                 where r.conversation_id = c and r.sender_id = o and r.recipient_id = u
                   and r.status = 'accepted')
     and private.may_request(o, u);
end $$;

-- TLDs treated as link endings by private.body_has_link.
create function private.link_tlds() returns text
language sql immutable as $$
  select 'com|net|org|edu|gov|mil|int|info|biz|name|pro|mobi|asia|eu'
      || '|io|co|me|to|tv|ly|gg|cc|ws|fm|la|sh|st|gl|im|ms|ps|sx|nu|cx|ac|vc|tk|ml|ga|cf|gq|pw'
      || '|app|dev|ai|xyz|link|site|online|live|chat|club|shop|store|vip|fun|top|space'
      || '|website|tech|page|lol|click|one|world|email|social|news|blog|art|life|zone'
      || '|onion|tel|gay|wtf|red|uk|ca|de|fr|ru|cn|au|br|es|nl|jp|kr|tw|mx|ar|pl|se'
      || '|fi|dk|ch|ie|nz|za|ph|sg|vn|th|tr|ua|ir|pk|ng|ke|ae|il|gr|pt|cz|hu|ro|kz|cl';
$$;

-- Does a message body contain a link? Used for minor threads.
--   Case-insensitive. Any of:
--   1. a URL scheme:              [a-z][a-z0-9+.-]*://      (http://, https://, ftp://, …)
--   2. www followed by a dot:     www.  (also the full-width dots 。．｡)
--   3. a TLD-looking token:       <label>.<tld>   e.g. example.com, t.me, bit.ly,
--                                 discord.gg, name@gmail.com — the dot may be a
--                                 full-width dot. <tld> is the curated list below.
--   4. spelled-out dots:          <label> dot <tld>, <label> (dot) <tld>,
--                                 <label> [dot] <tld>   (e.g. "example dot com")
--   5. an IPv4 address:           1.2.3.4
--   The TLD list deliberately leaves out two-letter TLDs that are everyday
--   English words (in, is, it, at, be, no, so, am, us, id, my, do, go, to is
--   KEPT because of link shorteners, me is KEPT because of t.me / wa.me), so
--   "done.it" or "ok.so" typed without a space is not treated as a link.
--   Known misses (accepted): links split across messages, unusual TLDs,
--   "example . com" with spaces around a real dot.
create function private.body_has_link(p_body text) returns boolean
language sql immutable set search_path = public as $$
  select p_body is not null and (
       p_body ~* '[a-z][a-z0-9+.-]*://'
    or p_body ~* '\mwww[.。．｡]'
    or p_body ~* ('\m[a-z0-9-]+[.。．｡](' || private.link_tlds() || ')\M')
    or p_body ~* ('\m[a-z0-9-]+(\s+|\s*[([]\s*)dot(\s+|\s*[])]\s*)(' || private.link_tlds() || ')\M')
    or p_body ~* '\m\d{1,3}([.]\d{1,3}){3}\M'
  );
$$;


-- Mark `c` as a minor thread if any past or present participant is under 18.
-- Sticky: never clears. Idempotent: no row is touched once set.
create function private.refresh_minor_flags(c uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversations
     set has_minor = true, moderation_sensitivity = 'elevated', retention_class = 'extended'
   where id = c
     and not has_minor
     and exists (select 1 from private.thread_participants(c) p where not public.is_adult(p));
$$;

-- Storage policy helper, self-only: is `p_name` an object in the CALLER's
-- folder that a media_assets row points at (as media or as poster)?
create function private.my_object_attached(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and starts_with(p_name, auth.uid()::text || '/')
     and exists (select 1 from public.media_assets m
                 where m.provider_asset_id = p_name or m.poster_path = p_name);
$$;


-- ============================================================================
-- can_dm — now "may start a DIRECT thread": not blocked and connected.
-- Everyone else goes through a message request.
-- ============================================================================
create or replace function public.can_dm(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if a is null or b is null or a = b or private.blocked_between(a, b) then
    return false;
  end if;
  return public.is_mutual(a, b);
end $$;


-- ============================================================================
-- CONVERSATIONS: origin + minor flags
-- ============================================================================
create function private.conversation_set_origin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.initiated_by       := new.created_by;
  new.initiator_was_minor := new.created_by is not null and not public.is_adult(new.created_by);
  new.has_minor          := new.initiator_was_minor;
  new.moderation_sensitivity := case when new.has_minor then 'elevated' else 'standard' end;
  new.retention_class        := case when new.has_minor then 'extended' else 'standard' end;
  return new;
end $$;
create trigger conversations_set_origin
  before insert on conversations
  for each row execute function private.conversation_set_origin();

-- Origin never changes; the minor flags only ever go up. Binds every role.
create function private.conversation_guard_flags() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.initiated_by is distinct from old.initiated_by
     or new.initiator_was_minor is distinct from old.initiator_was_minor
     or new.created_by is distinct from old.created_by
     or (old.has_minor and not new.has_minor)
     or (old.moderation_sensitivity = 'elevated' and new.moderation_sensitivity <> 'elevated')
     or (old.retention_class = 'extended' and new.retention_class <> 'extended') then
    raise exception 'conversation_origin_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger conversations_guard_flags
  before update on conversations
  for each row execute function private.conversation_guard_flags();

create function private.flags_on_member_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.left_at is null then
    perform private.refresh_minor_flags(new.conversation_id);
  end if;
  return new;
end $$;
create trigger conversation_members_minor_flags
  after insert or update of left_at on conversation_members
  for each row execute function private.flags_on_member_join();

-- Filed request: the recipient counts as a participant from now on, so the
-- flags are final before acceptance (see B, "conversations").
create function private.flags_on_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.conversation_id is not null then
    perform private.refresh_minor_flags(new.conversation_id);
  end if;
  return new;
end $$;
create trigger message_requests_minor_flags
  after insert on message_requests
  for each row execute function private.flags_on_request();

-- A DOB correction (service role only) re-flags that user's threads.
create function private.flags_on_dob_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c uuid;
begin
  for c in
    select conversation_id from public.conversation_members where user_id = new.id
    union
    select conversation_id from public.message_requests
     where (sender_id = new.id or recipient_id = new.id) and conversation_id is not null
  loop
    perform private.refresh_minor_flags(c);
  end loop;
  return new;
end $$;
create trigger users_dob_minor_flags
  after update of date_of_birth on users
  for each row when (old.date_of_birth is distinct from new.date_of_birth)
  execute function private.flags_on_dob_change();

-- Backfill conversations that predate this migration (origin from created_by;
-- initiator_was_minor uses the creator's CURRENT age — best effort).
update conversations
   set initiated_by = created_by,
       initiator_was_minor = created_by is not null and not public.is_adult(created_by)
 where initiated_by is null and created_by is not null;
update conversations
   set has_minor = true, moderation_sensitivity = 'elevated', retention_class = 'extended'
 where initiator_was_minor
    or exists (select 1 from private.thread_participants(conversations.id) p where not public.is_adult(p));


-- ============================================================================
-- MESSAGES: permission to send
-- The sender must be an active member and may_message every other ACTIVE
-- member AND every party of a request on this conversation (whether or not
-- they have joined — see B, "sending more"). Also applies to body edits.
-- A reply must quote a message in the same conversation.
-- ============================================================================
create or replace function public.require_dm_permission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  other_user uuid;
begin
  if not private.member_of(new.conversation_id, new.sender_id) then
    raise exception 'dm_not_allowed' using errcode = 'P0001';
  end if;
  for other_user in
    select user_id from public.conversation_members
     where conversation_id = new.conversation_id and left_at is null
    union
    select sender_id from public.message_requests where conversation_id = new.conversation_id
    union
    select recipient_id from public.message_requests where conversation_id = new.conversation_id
  loop
    if other_user <> new.sender_id
       and not private.may_message(new.conversation_id, new.sender_id, other_user) then
      raise exception 'dm_not_allowed' using errcode = 'P0001';
    end if;
  end loop;
  if new.reply_to_id is not null
     and not exists (select 1 from public.messages m
                     where m.id = new.reply_to_id and m.conversation_id = new.conversation_id) then
    raise exception 'dm_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
-- (trigger messages_require_dm_permission from 003 is kept; widen its columns)
drop trigger messages_require_dm_permission on messages;
create trigger messages_require_dm_permission
  before insert or update of body, reply_to_id on messages
  for each row execute function public.require_dm_permission();

-- Minor-thread content limits. Named so it fires AFTER the permission check
-- (triggers fire in name order).
create function private.enforce_minor_thread_limits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.conversations c
             where c.id = new.conversation_id and c.has_minor) then
    if new.media_id is not null or new.shared_post_id is not null then
      raise exception 'minor_thread_no_media'
        using errcode = '23514', detail = 'Photos, videos and shared posts are off in this chat.';
    end if;
    if private.body_has_link(new.body) then
      raise exception 'minor_thread_no_links'
        using errcode = '23514', detail = 'Links are off in this chat.';
    end if;
  end if;
  return new;
end $$;
create trigger messages_thread_limits
  before insert or update of body, media_id, shared_post_id on messages
  for each row execute function private.enforce_minor_thread_limits();

-- Extended retention: keep every edited body server-side.
create function private.keep_body_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.body is distinct from new.body
     and exists (select 1 from public.conversations c
                 where c.id = new.conversation_id and c.retention_class = 'extended') then
    insert into private.message_body_history (message_id, conversation_id, sender_id, body)
    values (old.id, old.conversation_id, old.sender_id, old.body);
  end if;
  return new;
end $$;
create trigger messages_keep_body_history
  after update of body on messages
  for each row execute function private.keep_body_history();

-- Extended retention: no hard deletes except by the purge job. Keyed on the
-- session role (the GUC `role`, which SECURITY DEFINER does not change):
-- anon/authenticated/service_role are refused; the owner (migrations, FK
-- cascades) is not.
create function private.forbid_extended_hard_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated', 'service_role')
     and coalesce(current_setting('app.retention_purge', true), '') <> 'on'
     and exists (select 1 from public.conversations c
                 where c.id = old.conversation_id and c.retention_class = 'extended') then
    raise exception 'minor_thread_no_hard_delete' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger messages_forbid_extended_hard_delete
  before delete on messages
  for each row execute function private.forbid_extended_hard_delete();

-- Clients never hard-delete messages (soft delete via deleted_at).
revoke delete on messages from anon, authenticated;


-- ============================================================================
-- CONVERSATION MEMBERS: permission to join
--   * leaving is always allowed;
--   * REQUEST threads: nobody is ever added by someone else; only the creator
--     (the request's sender) and a recipient who has accepted may be in it.
--     The "added by someone else" refusal comes first, before any status is
--     read (see B, "adding members");
--   * other threads: a client adding someone else must be an active member
--     connected (mutual) with them;
--   * everyone: the joiner must may_share_thread with every past and present
--     participant, and a minor cannot join a thread whose history holds media
--     or links.
-- One error for every refusal.
-- ============================================================================
create or replace function public.require_member_join_permission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adder uuid := auth.uid();
  creator uuid;
  other_user uuid;
begin
  if new.left_at is not null or (tg_op = 'UPDATE' and old.left_at is null) then
    return new;
  end if;
  select c.created_by into creator from public.conversations c where c.id = new.conversation_id;

  if exists (select 1 from public.message_requests r where r.conversation_id = new.conversation_id) then
    if adder is not null and adder <> new.user_id then
      raise exception 'member_join_not_allowed' using errcode = 'P0001';
    end if;
    if new.user_id is distinct from creator then
      if not exists (select 1 from public.message_requests r
                     where r.conversation_id = new.conversation_id
                       and r.recipient_id = new.user_id and r.status = 'accepted') then
        raise exception 'member_join_not_allowed' using errcode = 'P0001';
      end if;
    end if;
  elsif adder is not null and adder <> new.user_id then
    if not (private.member_of(new.conversation_id, adder) and public.can_dm(adder, new.user_id)) then
      raise exception 'member_join_not_allowed' using errcode = 'P0001';
    end if;
  end if;

  for other_user in
    select p from private.thread_participants(new.conversation_id) p where p <> new.user_id
  loop
    if not private.may_share_thread(new.conversation_id, new.user_id, other_user) then
      raise exception 'member_join_not_allowed' using errcode = 'P0001';
    end if;
  end loop;

  if not public.is_adult(new.user_id)
     and exists (select 1 from public.messages m
                 where m.conversation_id = new.conversation_id
                   and (m.media_id is not null or m.shared_post_id is not null
                        or private.body_has_link(m.body))) then
    raise exception 'member_join_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;


-- ============================================================================
-- MESSAGE REQUESTS
-- INSERT refusals all raise 'request_not_allowed', checked in this order,
-- with no check reading the status of an existing request:
--   status not pending | recipient missing | a request (S, R) already exists
--   | blocked either way | age rule (private.may_request)
--   | conversation given and: not created by S, or already carries a request,
--     or has another member, or holds another user's messages.
-- UPDATE: only status, only pending → accepted | declined, only by the
-- recipient (policy). Accepting re-checks block + age; declining always works.
-- ============================================================================
create or replace function public.message_request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'request_not_allowed' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.users u where u.id = new.recipient_id) then
      raise exception 'request_not_allowed' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.message_requests r
               where r.sender_id = new.sender_id and r.recipient_id = new.recipient_id) then
      raise exception 'request_not_allowed' using errcode = 'P0001';
    end if;
    if private.blocked_between(new.sender_id, new.recipient_id)
       or not private.may_request(new.sender_id, new.recipient_id) then
      raise exception 'request_not_allowed' using errcode = 'P0001';
    end if;
    if new.conversation_id is not null then
      if not exists (select 1 from public.conversations c
                     where c.id = new.conversation_id and c.created_by = new.sender_id) then
        raise exception 'request_not_allowed' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.message_requests r where r.conversation_id = new.conversation_id) then
        raise exception 'request_not_allowed' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.conversation_members m
                 where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id)
         or exists (select 1 from public.messages m
                    where m.conversation_id = new.conversation_id and m.sender_id <> new.sender_id) then
        raise exception 'request_not_allowed' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if (new.id, new.sender_id, new.recipient_id, new.conversation_id, new.created_at)
     is distinct from
     (old.id, old.sender_id, old.recipient_id, old.conversation_id, old.created_at) then
    raise exception 'message_request_immutable' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' or new.status not in ('accepted','declined') then
    raise exception 'message_request_invalid_transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;
  if new.status = 'accepted'
     and (private.blocked_between(new.sender_id, new.recipient_id)
          or not private.may_request(new.sender_id, new.recipient_id)) then
    raise exception 'request_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Status is not readable from the base table (by sender OR recipient).
revoke all on message_requests from anon, authenticated;
grant  select (id, sender_id, recipient_id, conversation_id, created_at)
  on message_requests to authenticated;
grant  insert (id, sender_id, recipient_id, conversation_id) on message_requests to authenticated;
grant  update (status) on message_requests to authenticated;

-- The recipient's view, the only place status is readable. Owner rights with
-- an explicit recipient filter (the caller has no SELECT on status).
drop view message_requests_inbox;
create view message_requests_inbox with (security_invoker = false) as
select id, sender_id, status, conversation_id, created_at
from message_requests
where recipient_id = (select auth.uid());
revoke all on message_requests_inbox from anon, authenticated;
grant select on message_requests_inbox to authenticated;


-- ============================================================================
-- CONVERSATION MEMBERS / ROSTER / CONVERSATIONS policies
-- ============================================================================
drop policy conversation_members_select on conversation_members;
create policy conversation_members_select_own on conversation_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Who is in a conversation, without anyone else's read/mute/leave/join state.
-- Owner rights; only for conversations the caller is an active member of.
create view conversation_roster with (security_invoker = false) as
select c.id as conversation_id, p.user_id
from conversations c
cross join lateral (
  select m.user_id from conversation_members m where m.conversation_id = c.id
  union
  select r.sender_id from message_requests r where r.conversation_id = c.id
  union
  select r.recipient_id from message_requests r where r.conversation_id = c.id
) p
where private.i_am_member(c.id);
revoke all on conversation_roster from anon, authenticated;
grant select on conversation_roster to authenticated;

-- Only the creator renames a conversation (a recipient renaming a request
-- thread would signal acceptance).
drop policy conversations_update on conversations;
create policy conversations_update_creator on conversations for update to authenticated
  using (created_by = (select auth.uid()) and private.i_am_member(id))
  with check (created_by = (select auth.uid()) and private.i_am_member(id));


-- ============================================================================
-- MEDIA HARDENING
-- ============================================================================
-- status and duration_ms are set once, at INSERT.
revoke update on media_assets from anon, authenticated;
grant  update (width, height, bytes, content_hash, deleted_at) on media_assets to authenticated;

create function private.media_deletion_is_final() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null
     and new.deleted_at is distinct from old.deleted_at
     and current_user in ('anon', 'authenticated') then
    raise exception 'media_deletion_is_final' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger media_assets_deletion_is_final
  before update of deleted_at on media_assets
  for each row execute function private.media_deletion_is_final();

-- Attached storage objects are immutable to clients.
drop policy media_owner_insert on storage.objects;
drop policy media_owner_update on storage.objects;
drop policy media_owner_delete on storage.objects;
create policy media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.my_object_attached(name));
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.my_object_attached(name))
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and not private.my_object_attached(name));
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.my_object_attached(name));


-- ============================================================================
-- NO TRUNCATE FOR CLIENTS
-- ============================================================================
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;


-- ============================================================================
-- FUNCTION PRIVILEGES
-- ============================================================================
revoke execute on function public.can_dm(uuid, uuid)                     from public, anon, authenticated;
revoke execute on function public.require_dm_permission()                from public, anon, authenticated;
revoke execute on function public.require_member_join_permission()       from public, anon, authenticated;
revoke execute on function public.message_request_guard()                from public, anon, authenticated;
revoke execute on function private.thread_participants(uuid)             from public, anon, authenticated;
revoke execute on function private.may_request(uuid, uuid)               from public, anon, authenticated;
revoke execute on function private.may_message(uuid, uuid, uuid)         from public, anon, authenticated;
revoke execute on function private.may_share_thread(uuid, uuid, uuid)    from public, anon, authenticated;
revoke execute on function private.body_has_link(text)                   from public, anon, authenticated;
revoke execute on function private.link_tlds()                           from public, anon, authenticated;
revoke execute on function private.refresh_minor_flags(uuid)             from public, anon, authenticated;
revoke execute on function private.conversation_set_origin()             from public, anon, authenticated;
revoke execute on function private.conversation_guard_flags()            from public, anon, authenticated;
revoke execute on function private.flags_on_member_join()                from public, anon, authenticated;
revoke execute on function private.flags_on_request()                    from public, anon, authenticated;
revoke execute on function private.flags_on_dob_change()                 from public, anon, authenticated;
revoke execute on function private.enforce_minor_thread_limits()         from public, anon, authenticated;
revoke execute on function private.keep_body_history()                   from public, anon, authenticated;
revoke execute on function private.forbid_extended_hard_delete()         from public, anon, authenticated;
revoke execute on function private.media_deletion_is_final()             from public, anon, authenticated;
-- Storage policies call this as the client; it answers only about the
-- caller's own folder.
revoke execute on function private.my_object_attached(text)              from public, anon;
grant  execute on function private.my_object_attached(text)              to authenticated;
