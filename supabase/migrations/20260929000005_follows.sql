-- ============================================================================
-- 005 — Follow button, with no public counts.
--
-- Product change from Colin (2026-09-29), superseding brief §4's "no follow
-- button": users can follow creators, but follower/following COUNTS are never
-- shown to anyone. Invariant 7 (no public counts) still holds.
--
-- Rules:
--   * A follow row is visible only to its two parties. No one can count
--     another user's followers; the creator sees who follows them (private).
--   * Follows are never readable by anon.
--   * No follow across a block. Blocking removes follows in both directions.
--   * Following grants nothing on its own. DM rights still come only from the
--     relationship model and age rules (§7).
--   * The relationships/interactions model is unchanged and still write-only
--     for the server.
-- ============================================================================

create table follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows(followee_id, created_at desc);

alter table follows enable row level security;

revoke all on follows from anon, authenticated;
grant select on follows to authenticated;
grant insert (follower_id, followee_id) on follows to authenticated;
grant delete on follows to authenticated;

create policy follows_select_parties on follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

create policy follows_insert_self on follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not private.blocked_with_me(followee_id)
  );

create policy follows_delete_self on follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Blocking severs follows both ways (security definer: the blocker can't
-- otherwise delete the other user's follow row).
create function private.sever_follows_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end $$;

revoke execute on function private.sever_follows_on_block() from public, anon, authenticated;

create trigger blocks_sever_follows
  after insert on blocks
  for each row execute function private.sever_follows_on_block();
