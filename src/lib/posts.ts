import { mediaStore } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export const PAGE_SIZE = 20;
const SIGNED_URL_TTL_SECONDS = 3600;

/** Keyset cursor: the (created_at, id) of the last post on the previous page. */
export type Cursor = { created_at: string; id: string };

export function cursorOf(post: Pick<FeedPost, 'created_at' | 'id'>): Cursor {
  return { created_at: post.created_at, id: post.id };
}

/** Batch-sign storage paths. Failures yield no entry (callers show a placeholder). */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const signed = await mediaStore.signedUrls(paths, SIGNED_URL_TTL_SECONDS);
  for (const [path, url] of Object.entries(signed)) {
    if (url) urls.set(path, url);
    else if (__DEV__) console.warn('signed url missing for', path);
  }
  return urls;
}

export type Visibility = 'public' | 'followers' | 'friends' | 'private';

/** The post kinds the feeds show. Stories are not part of Milestone 2. */
export type FeedKind = 'post' | 'reel';

export type AuthorProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
};

export type FeedPost = {
  id: string;
  author_id: string;
  /** 'post' = image or text; 'reel' = a ≤30 s video. */
  kind: FeedKind;
  caption: string | null;
  created_at: string;
  visibility: Visibility;
  /** Storage path of the image in the private `media` bucket (image posts only). */
  imagePath: string | null;
  /** Short-lived signed URL for imagePath; null if it could not be signed. */
  imageUrl: string | null;
  /** Storage path of the reel's video (reels only). */
  videoPath: string | null;
  /** Short-lived signed URL for videoPath; null if it could not be signed. */
  videoUrl: string | null;
  /** Storage path of the reel's poster JPEG (reels only, may be absent). */
  posterPath: string | null;
  /** Short-lived signed URL for posterPath. */
  posterUrl: string | null;
  /** Reel duration in milliseconds (reels only). */
  durationMs: number | null;
  /** width / height of the first media item, clamped to [0.5, 2]. */
  aspectRatio: number;
  author: AuthorProfile | null;
  likedByMe: boolean;
};

// Narrow shape of the embedded select below (the generated types don't model embeds well).
type PostRow = {
  id: string;
  author_id: string;
  kind: FeedKind;
  caption: string | null;
  created_at: string;
  visibility: Visibility;
  post_media: {
    position: number;
    media_assets: {
      kind: 'image' | 'video' | 'audio';
      provider_asset_id: string | null;
      poster_path: string | null;
      duration_ms: number | null;
      width: number | null;
      height: number | null;
    } | null;
  }[];
  likes: { user_id: string }[];
};

const POST_SELECT =
  'id, author_id, kind, caption, created_at, visibility, ' +
  'post_media(position, media_assets(kind, provider_asset_id, poster_path, duration_ms, width, height)), ' +
  'likes(user_id)';

export type FetchPostsOptions = {
  me: string;
  cursor?: Cursor | null;
  /** Only this author. */
  authorId?: string;
  /** Only these authors (an empty list returns no posts without a request). */
  authorIds?: string[];
  /** Exclude these authors. */
  excludeAuthorIds?: string[];
  /** Only posts created at or after this ISO timestamp. */
  since?: string;
  /** Only public posts (Discover). RLS still applies on top. */
  publicOnly?: boolean;
  kinds?: FeedKind[];
  limit?: number;
};

/** Quote a uuid list for PostgREST `in.(…)` filters. Ids are validated, never user text. */
function inList(ids: string[]): string {
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Invalid id in filter: ${id}`);
  }
  return `(${ids.join(',')})`;
}

/**
 * One page of posts, newest first. RLS decides which posts are visible.
 * `likes` is filtered to the current user, so a non-empty array means "I liked it".
 */
export async function fetchPosts(opts: FetchPostsOptions): Promise<FeedPost[]> {
  if (opts.authorIds && opts.authorIds.length === 0) return [];
  const kinds = opts.kinds ?? ['post'];
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .in('kind', kinds)
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
  if (opts.authorIds) query = query.in('author_id', opts.authorIds);
  if (opts.excludeAuthorIds && opts.excludeAuthorIds.length > 0) {
    query = query.not('author_id', 'in', inList(opts.excludeAuthorIds));
  }
  if (opts.since) query = query.gte('created_at', opts.since);
  if (opts.publicOnly) query = query.eq('visibility', 'public');

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as PostRow[];
  return hydrate(rows);
}

async function fetchAuthors(authorIds: string[]): Promise<Map<string, AuthorProfile>> {
  const authors = new Map<string, AuthorProfile>();
  if (authorIds.length === 0) return authors;
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, username, display_name')
    .in('user_id', authorIds);
  if (error) throw error;
  for (const p of profiles ?? []) authors.set(p.user_id, p);
  return authors;
}

/** Attach authors and batch-signed media URLs (one signing call per page). */
async function hydrate(rows: PostRow[]): Promise<FeedPost[]> {
  const firstMedia = new Map(
    rows.map((r) => [r.id, [...r.post_media].sort((a, b) => a.position - b.position)[0]?.media_assets ?? null]),
  );
  const paths: string[] = [];
  for (const media of firstMedia.values()) {
    if (media?.provider_asset_id) paths.push(media.provider_asset_id);
    if (media?.poster_path) paths.push(media.poster_path);
  }
  const [authors, signed] = await Promise.all([
    fetchAuthors([...new Set(rows.map((r) => r.author_id))]),
    signPaths(paths),
  ]);

  return rows.map((r) => {
    const media = firstMedia.get(r.id) ?? null;
    const isVideo = media?.kind === 'video';
    const mediaPath = media?.provider_asset_id ?? null;
    const imagePath = !isVideo ? mediaPath : null;
    const videoPath = isVideo ? mediaPath : null;
    const posterPath = isVideo ? (media?.poster_path ?? null) : null;
    const fallbackRatio = r.kind === 'reel' ? 9 / 16 : 4 / 5;
    const ratio = media?.width && media?.height ? media.width / media.height : fallbackRatio;
    return {
      id: r.id,
      author_id: r.author_id,
      kind: r.kind,
      caption: r.caption,
      created_at: r.created_at,
      visibility: r.visibility,
      imagePath,
      imageUrl: imagePath ? (signed.get(imagePath) ?? null) : null,
      videoPath,
      videoUrl: videoPath ? (signed.get(videoPath) ?? null) : null,
      posterPath,
      posterUrl: posterPath ? (signed.get(posterPath) ?? null) : null,
      durationMs: isVideo ? (media?.duration_ms ?? null) : null,
      aspectRatio: Math.min(Math.max(ratio, 0.5), 2),
      author: authors.get(r.author_id) ?? null,
      likedByMe: r.likes.length > 0,
    };
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One post by id, or null when it does not exist or RLS hides it from this viewer (the two are
 * deliberately indistinguishable). Works signed out: `me` is null, the likes embed is skipped and
 * anon can only read public posts.
 */
export async function fetchPostById(id: string, me: string | null): Promise<FeedPost | null> {
  if (!UUID_RE.test(id)) return null;
  const select = me ? POST_SELECT : POST_SELECT.replace(', likes(user_id)', '');
  let query = supabase.from('posts').select(select).eq('id', id).is('deleted_at', null);
  if (me) query = query.eq('likes.user_id', me);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as PostRow;
  if (row.kind !== 'post' && row.kind !== 'reel') return null;
  const [post] = await hydrate([{ ...row, likes: row.likes ?? [] }]);
  return post ?? null;
}

export function fetchFeedPage(me: string, cursor?: Cursor | null) {
  return fetchPosts({ me, cursor });
}

export function fetchUserPosts(me: string, authorId: string) {
  return fetchPosts({ me, authorId, kinds: ['post', 'reel'], limit: 60 });
}

export async function setLike(postId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('likes').insert({ post_id: postId, user_id: userId })
    : await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

/** Re-sign one storage path (e.g. after a signed URL expired). Null if signing failed. */
export async function signImagePath(path: string): Promise<string | null> {
  return mediaStore.signedUrl(path, SIGNED_URL_TTL_SECONDS);
}

/** Re-sign any media path (video, poster or image). Null if signing failed. */
export const signMediaPath = signImagePath;
