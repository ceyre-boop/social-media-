-- ============================================================================
-- 006 — "Followers" visibility = people who follow + people who return.
--
-- Colin's call (2026-09-29): a post with visibility 'followers' is visible to
-- anyone who tapped Follow on the author, plus anyone whose relationship to the
-- author is 'returning' or 'regular'. Everything else is unchanged from 003.
-- ============================================================================

create or replace function private.post_visible_for(
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
    when 'followers' then p_viewer is not null and (
                            exists (select 1 from public.follows f
                                     where f.follower_id = p_viewer and f.followee_id = p_author)
                            or coalesce(public.relationship_state(p_viewer, p_author)
                                        in ('returning','regular'), false))
    when 'friends'   then public.is_mutual(p_viewer, p_author)
    when 'private'   then false  -- author handled above
  end;
end $$;
