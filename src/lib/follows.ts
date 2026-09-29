import { supabase } from '@/lib/supabase';

/**
 * Which of `authorIds` does `me` follow? One query per feed page. RLS only returns rows where
 * the caller is a party, so this can never reveal anyone else's relationships. No counts, ever.
 */
export async function fetchFollowing(me: string, authorIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(authorIds.filter((id) => id !== me))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', me)
    .in('followee_id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.followee_id));
}

export async function setFollow(me: string, authorId: string, follow: boolean) {
  const { error } = follow
    ? await supabase.from('follows').insert({ follower_id: me, followee_id: authorId })
    : await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', authorId);
  if (error) throw error;
}
