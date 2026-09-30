import { supabase } from '@/lib/supabase';

/** What a public profile page shows. No counts, ever. */
export type PublicProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  link_url: string | null;
};

/**
 * One profile by username (case-insensitive: the column is citext). RLS decides visibility, so a
 * missing, blocked or hidden profile all resolve to null and show the same friendly not-found.
 */
export async function fetchProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, display_name, bio, link_url')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
