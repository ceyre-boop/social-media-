import { supabase } from '@/lib/supabase';

export const PAGE_SIZE = 20;

export type Visibility = 'public' | 'followers' | 'friends' | 'private';

export type AuthorProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
};

export type FeedPost = {
  id: string;
  author_id: string;
  caption: string | null;
  created_at: string;
  visibility: Visibility;
  imageUrl: string | null;
  aspectRatio: number;
  author: AuthorProfile | null;
  likedByMe: boolean;
};

// Narrow shape of the embedded select below (the generated types don't model embeds well).
type PostRow = {
  id: string;
  author_id: string;
  caption: string | null;
  created_at: string;
  visibility: Visibility;
  post_media: {
    position: number;
    media_assets: {
      playback_url: string | null;
      width: number | null;
      height: number | null;
    } | null;
  }[];
  likes: { user_id: string }[];
};

const POST_SELECT =
  'id, author_id, caption, created_at, visibility, ' +
  'post_media(position, media_assets(playback_url, width, height)), ' +
  'likes(user_id)';

/**
 * One page of posts, newest first. RLS decides which posts are visible.
 * `likes` is filtered to the current user, so a non-empty array means "I liked it".
 */
async function fetchPosts(opts: {
  me: string;
  cursor?: string | null;
  authorId?: string;
  limit?: number;
}): Promise<FeedPost[]> {
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('kind', 'post')
    .is('deleted_at', null)
    .eq('likes.user_id', opts.me)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? PAGE_SIZE);
  if (opts.cursor) query = query.lt('created_at', opts.cursor);
  if (opts.authorId) query = query.eq('author_id', opts.authorId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as PostRow[];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const authors = new Map<string, AuthorProfile>();
  if (authorIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, username, display_name')
      .in('user_id', authorIds);
    if (pErr) throw pErr;
    for (const p of profiles ?? []) authors.set(p.user_id, p);
  }

  return rows.map((r) => {
    const media = [...r.post_media].sort((a, b) => a.position - b.position)[0]?.media_assets;
    const ratio = media?.width && media?.height ? media.width / media.height : 1;
    return {
      id: r.id,
      author_id: r.author_id,
      caption: r.caption,
      created_at: r.created_at,
      visibility: r.visibility,
      imageUrl: media?.playback_url ?? null,
      aspectRatio: Math.min(Math.max(ratio, 0.5), 2),
      author: authors.get(r.author_id) ?? null,
      likedByMe: r.likes.length > 0,
    };
  });
}

export function fetchFeedPage(me: string, cursor?: string | null) {
  return fetchPosts({ me, cursor });
}

export function fetchUserPosts(me: string, authorId: string) {
  return fetchPosts({ me, authorId, limit: 60 });
}

export async function setLike(postId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('likes').insert({ post_id: postId, user_id: userId })
    : await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}
