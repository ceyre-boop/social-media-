/**
 * Data access for Settings. Every read and write is the signed-in person's own row (RLS); the
 * database enforces the rules (quiet hours, friend request permission, deletion confirmation).
 */
import { supabase } from '@/lib/supabase';

export type FriendRequestPolicy = 'everyone' | 'following' | 'nobody';
export type ChatStrictness = 'open' | 'standard' | 'protected';

export type UserSettings = {
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  waking_start: string;
  waking_end: string;
  /** null = we pick one or two a day. */
  moment_prompts_per_day: 1 | 2 | null;
  friend_requests_from: FriendRequestPolicy;
  default_chat_strictness: ChatStrictness;
};

const COLUMNS =
  'timezone, quiet_start, quiet_end, waking_start, waking_end, moment_prompts_per_day, friend_requests_from, default_chat_strictness';

export async function fetchUserSettings(uid: string): Promise<UserSettings> {
  const { data, error } = await supabase.from('users').select(COLUMNS).eq('id', uid).single();
  if (error) throw error;
  return data as UserSettings;
}

export async function updateUserSettings(uid: string, patch: Partial<UserSettings>): Promise<void> {
  const { error } = await supabase.from('users').update(patch).eq('id', uid);
  if (error) throw error;
}

// ---------------------------------------------------------------- notifications
export type PrefRow = { type: string; enabled: boolean };

export async function fetchNotificationPrefs(): Promise<PrefRow[]> {
  const { data, error } = await supabase.rpc('my_notification_prefs');
  if (error) throw error;
  return (data ?? []).map((r) => ({ type: r.type, enabled: r.enabled }));
}

export async function setNotificationPref(uid: string, type: string, enabled: boolean): Promise<void> {
  // Clients may only write `enabled` on an existing row (column grants), so update first, then insert.
  const upd = await supabase
    .from('notification_prefs')
    .update({ enabled })
    .eq('user_id', uid)
    .eq('type', type as never)
    .select('type');
  if (upd.error) throw upd.error;
  if ((upd.data ?? []).length > 0) return;
  const { error } = await supabase
    .from('notification_prefs')
    .insert({ user_id: uid, type: type as never, enabled });
  if (error) throw error;
}

// ---------------------------------------------------------------- blocked people
export type BlockedUser = {
  user_id: string;
  username: string | null;
  display_name: string | null;
};

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('my_blocked_users');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    display_name: r.display_name,
  }));
}

export async function unblockUser(me: string, target: string): Promise<void> {
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', target);
  if (error) throw error;
}

// ---------------------------------------------------------------- Trusted Circle
export type CircleMember = { user_id: string; username: string; display_name: string | null };

export async function fetchCircle(me: string): Promise<CircleMember[]> {
  const { data: rows, error } = await supabase
    .from('trusted_circle_members')
    .select('member_id')
    .eq('creator_id', me)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.member_id);
  if (ids.length === 0) return [];
  const { data: people, error: e2 } = await supabase
    .from('profiles')
    .select('user_id, username, display_name')
    .in('user_id', ids);
  if (e2) throw e2;
  const byId = new Map((people ?? []).map((p) => [p.user_id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ user_id: id, username: p.username, display_name: p.display_name }] : [];
  });
}

export async function addToCircle(me: string, member: string): Promise<void> {
  const { error } = await supabase
    .from('trusted_circle_members')
    .upsert({ creator_id: me, member_id: member }, { onConflict: 'creator_id,member_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeFromCircle(me: string, member: string): Promise<void> {
  const { error } = await supabase
    .from('trusted_circle_members')
    .delete()
    .eq('creator_id', me)
    .eq('member_id', member);
  if (error) throw error;
}

// ---------------------------------------------------------------- data export
export async function fetchOpenExport(): Promise<{ requested_at: string; status: string } | null> {
  const { data, error } = await supabase
    .from('data_export_requests')
    .select('requested_at, status')
    .in('status', ['requested', 'processing'])
    .order('requested_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function requestExport(uid: string): Promise<void> {
  const { error } = await supabase.from('data_export_requests').insert({ user_id: uid });
  // 23505: one is already open. Same outcome for the person.
  if (error && error.code !== '23505') throw error;
}

// ---------------------------------------------------------------- account deletion
export async function fetchPendingDeletion(): Promise<{ scheduled_for: string } | null> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('scheduled_for')
    .eq('status', 'pending')
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function requestAccountDeletion(confirmUsername: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_account_deletion', {
    confirm_username: confirmUsername,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('cancel_account_deletion');
  if (error) throw error;
}
