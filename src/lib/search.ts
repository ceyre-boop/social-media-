import { supabase } from '@/lib/supabase';

import { readRecents, writeRecents } from './searchStorage';

export type SearchResult = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_media_id: string | null;
  bio_snippet: string | null;
};

/** People matching `q` by username or display name. Blocks and inactive accounts are hidden server-side. */
export async function searchUsers(q: string, lim = 20): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_users', { q, lim });
  if (error) throw error;
  return data ?? [];
}

export const MAX_RECENTS = 10;

export function loadRecents(): string[] {
  return readRecents();
}

/** Newest first, case-insensitive de-dupe, capped at 10. Returns the new list. */
export function addRecent(query: string): string[] {
  const q = query.trim();
  if (!q) return readRecents();
  const next = [q, ...readRecents().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_RECENTS,
  );
  writeRecents(next);
  return next;
}

export function removeRecent(query: string): string[] {
  const next = readRecents().filter((r) => r !== query);
  writeRecents(next);
  return next;
}

export function clearRecents(): string[] {
  writeRecents([]);
  return [];
}
