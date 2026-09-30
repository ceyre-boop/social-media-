/**
 * The two Milestone 2 feeds.
 *
 *   Home     — people you return to: authors you follow, authors whose
 *              relationship to you is 'returning' or 'regular', and yourself.
 *              Chronological, keyset-paginated, never refilled with strangers.
 *   Discover — FINITE: at most 30 recent public posts (last 7 days) from people
 *              outside your Home set, as one page. After it the UI shows a
 *              terminal "That's everything for now" state.
 *
 * RLS still decides visibility on every row; these filters only choose which
 * visible posts belong to which feed.
 */
import { cursorOf, fetchPosts, type Cursor, type FeedKind, type FeedPost } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

export const HOME_PAGE_SIZE = 10;
export const DISCOVER_CAP = 30;
export const DISCOVER_WINDOW_DAYS = 7;
/** Safety net if the screen never calls refreshHomeAuthors (e.g. no focus events). */
const HOME_SET_MAX_AGE_MS = 5 * 60 * 1000;
const FEED_KINDS: FeedKind[] = ['post', 'reel'];

export type HomePage = {
  posts: FeedPost[];
  /** Pass back to fetchHome for the next page; null when there are no more. */
  nextCursor: Cursor | null;
  /** True when Home has nothing at all (first page empty): point to Discover. */
  empty: boolean;
};

export type DiscoverPage = {
  posts: FeedPost[];
  /** Always true: Discover is one finite page. */
  done: true;
};

type HomeSet = { me: string; authorIds: string[]; loadedAt: number };

let homeSet: HomeSet | null = null;
let inflight: { me: string; promise: Promise<string[]> } | null = null;

async function loadHomeAuthors(me: string): Promise<string[]> {
  const [follows, relationships] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', me),
    supabase
      .from('relationships')
      .select('subject_id')
      .eq('actor_id', me)
      .in('state', ['returning', 'regular']),
  ]);
  if (follows.error) throw follows.error;
  if (relationships.error) throw relationships.error;
  const ids = new Set<string>([me]);
  for (const row of follows.data ?? []) ids.add(row.followee_id);
  for (const row of relationships.data ?? []) ids.add(row.subject_id);
  return [...ids];
}

/**
 * The author ids that make up my Home (always includes me). Cached per
 * signed-in user; concurrent callers share one request.
 */
export async function getHomeAuthors(me: string, opts: { force?: boolean } = {}): Promise<string[]> {
  const fresh = homeSet && homeSet.me === me && Date.now() - homeSet.loadedAt < HOME_SET_MAX_AGE_MS;
  if (!opts.force && fresh && homeSet) return homeSet.authorIds;
  if (inflight && inflight.me === me) return inflight.promise;

  const promise = loadHomeAuthors(me);
  inflight = { me, promise };
  try {
    const authorIds = await promise;
    homeSet = { me, authorIds, loadedAt: Date.now() };
    return authorIds;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

/** Re-read follows + relationships (call on screen focus and after follow/unfollow). */
export function refreshHomeAuthors(me: string): Promise<string[]> {
  return getHomeAuthors(me, { force: true });
}

/** Forget the cached Home set (call on sign-out). */
export function clearHomeAuthors(): void {
  homeSet = null;
  inflight = null;
}

/** One Home page (10 posts), newest first. Pass the previous page's nextCursor to continue. */
export async function fetchHome(me: string, cursor?: Cursor | null): Promise<HomePage> {
  const authorIds = await getHomeAuthors(me);
  const posts = await fetchPosts({
    me,
    cursor,
    authorIds,
    kinds: FEED_KINDS,
    limit: HOME_PAGE_SIZE,
  });
  const last = posts[posts.length - 1];
  return {
    posts,
    nextCursor: posts.length === HOME_PAGE_SIZE && last ? cursorOf(last) : null,
    empty: !cursor && posts.length === 0,
  };
}

/** Discover: up to 30 public posts from the last 7 days by people outside my Home set. */
export async function fetchDiscover(me: string): Promise<DiscoverPage> {
  const homeAuthors = await getHomeAuthors(me);
  const since = new Date(Date.now() - DISCOVER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const posts = await fetchPosts({
    me,
    excludeAuthorIds: homeAuthors,
    publicOnly: true,
    since,
    kinds: FEED_KINDS,
    limit: DISCOVER_CAP,
  });
  return { posts, done: true };
}
