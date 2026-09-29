import { supabase } from '@/lib/supabase';

export const PAGE_SIZE = 20;
const SIGNED_URL_TTL_SECONDS = 3600;

/** Keyset cursor: the (created_at, id) of the last post on the previous page. */
export type Cursor = { created_at: string; id: string };

export function cursorOf(post: Pick<FeedPost, "created_at" | "id">): Cursor {
  return { created_at: post.created_at, id: post.id };
}

/** Batch-sign storage paths. Failures yield no entry (callers show a placeholder). */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return urls;
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) {
    if (__DEV__) console.warn("createSignedUrls failed:", error.message);
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    else if (__DEV__) console.warn("signed url missing for", item.path, item.error);
  }
  return urls;
}

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
  /** Storage path in the private `media` bucket. */
  imagePath: string | null;
  /** Short-lived signed URL for imagePath; null if it could not be signed. */
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
      provider_asset_id: string | null;
      width: number | null;
      height: number | null;
    } | null;
  }[];
  likes: { user_id: string }[];
};

const POST_SELECT =
  'id, author_id, caption, created_at, visibility, ' +
  'post_media(position, media_assets(provider_asset_id, width, height)), ' +
  'likes(user_id)';

/**
 * One page of posts, newest first. RLS decides which posts are visible.
 * `likes` is filtered to the current user, so a non-empty array means "I liked it".
 */
async function fetchPosts(opts: {
  me: string;
  cursor?: Cursor | null;
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
    .order('id', { ascending: false })
    .limit(opts.limit ?? PAGE_SIZE);
  if (opts.cursor) {
    const { created_at: t, id } = opts.cursor;
    query = query.or(`created_at.lt.${t},and(created_at.eq.${t},id.lt.${id})`);
  }
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

  const paths = rows.flatMap((r) =>
    r.post_media.map((m) => m.media_assets?.provider_asset_id).filter((p): p is string => !!p),
  );
  const signed = await signPaths(paths);

  return rows.map((r) => {
    const media = [...r.post_media].sort((a, b) => a.position - b.position)[0]?.media_assets;
    const imagePath = media?.provider_asset_id ?? null;
    const ratio = media?.width && media?.height ? media.width / media.height : 4 / 5;
    return {
      id: r.id,
      author_id: r.author_id,
      caption: r.caption,
      created_at: r.created_at,
      visibility: r.visibility,
      imagePath,
      imageUrl: imagePath ? (signed.get(imagePath) ?? null) : null,
      aspectRatio: Math.min(Math.max(ratio, 0.5), 2),
      author: authors.get(r.author_id) ?? null,
      likedByMe: r.likes.length > 0,
    };
  });
}

export function fetchFeedPage(me: string, cursor?: Cursor | null) {
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

/** Re-sign one storage path (e.g. after a signed URL expired). Null if signing failed. */
export async function signImagePath(path: string): Promise<string | null> {
  const urls = await signPaths([path]);
  return urls.get(path) ?? null;
}
