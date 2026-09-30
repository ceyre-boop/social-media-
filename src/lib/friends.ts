/**
 * Explicit friendships (migration 014). Used only by Moments; "Regulars" post visibility is
 * behaviour-derived and unrelated.
 *
 * Every write is an RPC; the database enforces the age and block rules and answers every refusal
 * with the same generic error, so the app shows one friendly message and never guesses why.
 * Nobody sees anyone else's friends, and nothing here counts anything.
 */
import { requestPushPermission } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export type FriendStatus = 'friends' | 'incoming' | 'outgoing';

export type Friendship = {
  user_id: string;
  username: string;
  display_name: string | null;
  status: FriendStatus;
  since: string;
};

export type PersonBasics = { user_id: string; username: string; display_name: string | null };

/** The one message for any refused friend action (age rule, block, missing person, network). */
export const FRIEND_ACTION_FAILED = "That didn't go through. You can try again later.";

export async function fetchFriendships(): Promise<Friendship[]> {
  const { data, error } = await supabase.rpc('my_friendships');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    display_name: r.display_name,
    status: r.status as FriendStatus,
    since: r.since,
  }));
}

/** Ids of accepted friends. */
export async function fetchFriendIds(): Promise<string[]> {
  return (await fetchFriendships()).filter((f) => f.status === 'friends').map((f) => f.user_id);
}

let askedThisSession = false;

/**
 * In context, never at launch: the first time someone sends a friend request or has one waiting,
 * explain and offer push (so they hear when it's answered, or when someone asks). Once per session;
 * requestPushPermission itself does nothing if they already answered the OS prompt.
 */
export function askForFriendNotifications(): void {
  if (askedThisSession) return;
  askedThisSession = true;
  void requestPushPermission(
    'We can let you know when someone asks to be your friend, or says yes to you. Nothing else from this.',
  );
}

/** 'requested' (or a no-op that looks the same) | 'friends' (they had asked you). */
export async function requestFriend(target: string): Promise<'requested' | 'friends'> {
  const { data, error } = await supabase.rpc('request_friend', { target });
  if (error) throw error;
  askForFriendNotifications();
  return data === 'friends' ? 'friends' : 'requested';
}

export async function respondFriend(other: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_friend', { other, accept });
  if (error) throw error;
}

/** Unfriend, cancel your request, or clear a request to you. */
export async function removeFriend(other: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { other });
  if (error) throw error;
}

/** Normalises what someone typed into a username: trims, drops a leading @. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').trim();
}

/** Exact username match only (not search). Null when there is nobody by that name you can see. */
export async function findUserByUsername(input: string): Promise<PersonBasics | null> {
  const name = normalizeUsername(input);
  if (!name) return null;
  const { data, error } = await supabase.rpc('find_user_by_username', { name });
  if (error) throw error;
  const row = data?.[0];
  return row ? { user_id: row.user_id, username: row.username, display_name: row.display_name } : null;
}
