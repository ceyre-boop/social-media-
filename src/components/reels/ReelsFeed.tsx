import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ReelPage } from '@/components/reels/ReelPage';
import { PerfOverlay } from '@/components/reels/player/PerfOverlay';
import {
  PlayerPoolProvider,
  usePlayerPool,
  type ReelSource,
} from '@/components/reels/player/PlayerPool';
import {
  Button,
  Brand,
  IconButton,
  LogoMark,
  PageTitle,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { useBreakpoint, useNavClearance } from '@/lib/layout';
import { fetchFollowing, setFollow } from '@/lib/follows';
import { useRevalidate } from '@/lib/network';
import { refreshHomeAuthors } from '@/lib/feeds';
import { PAGE_SIZE, cursorOf, setLike, signMediaPath, type FeedPost } from '@/lib/posts';
import { stage as c, useTheme } from '@/lib/theme';

export type PageCursor = ReturnType<typeof cursorOf>;

/** Context handed to custom empty/end pages so they can fill exactly one snap page. */
export type FeedPageContext = { height: number; width: number; bottomInset: number };

type Props = {
  /** Web document title. */
  title: string;
  /** Fetches one page. Must be a stable reference (module-level function). */
  loadPage: (me: string, cursor?: PageCursor) => Promise<FeedPost[]>;
  /** A full page has this many posts; a shorter page means the feed is finished. */
  pageSize?: number;
  /** One page only, then the end page (Discover is deliberately finite). */
  finite?: boolean;
  /** Replaces the default "nothing here yet" page. */
  emptyPage?: (ctx: FeedPageContext) => React.ReactNode;
  /** Replaces the default "all caught up" page at the end of the feed. */
  endPage?: (ctx: FeedPageContext) => React.ReactNode;
};

/**
 * Pager implementation (dev toggle, measured on device; see DESIGN.md "Reel player").
 *   flashlist  — A: FlashList, pagingEnabled + snapToInterval (default).
 *   scrollview — B: Reanimated Animated.ScrollView, pagingEnabled + snapToInterval, windowed pages.
 * In both, the swipe never touches React state: the live index is a shared value and the settled
 * index is committed to JS once per settle, which then reassigns the player slots.
 */
export const REEL_PAGER: 'flashlist' | 'scrollview' =
  process.env.EXPO_PUBLIC_REEL_PAGER === 'scrollview' ? 'scrollview' : 'flashlist';
/** Pager B mounts real pages only within this distance of the settled page. */
const SCROLLVIEW_WINDOW = 2;
/** Web has no momentum-end event: commit after scrolling has been idle this long. */
const WEB_SETTLE_IDLE_MS = 120;
const VIEWABILITY = { itemVisiblePercentThreshold: 80 };
/** Signed URLs last an hour; re-sign a little before that. */
const URL_MAX_AGE_MS = 50 * 60 * 1000;

function newer(a: FeedPost, b: FeedPost): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Merge a fresh first page into what is already loaded: new posts slot in by (created_at, id),
 * loaded pages stay, and posts the server no longer returns inside the fresh page's range
 * (deleted, unfollowed) drop out — never the one being watched.
 */
function mergeFeed(prev: FeedPost[], page: FeedPost[], pageSize: number, keepId?: string): FeedPost[] {
  const inPage = new Set(page.map((p) => p.id));
  const oldest = page[page.length - 1];
  const complete = page.length < pageSize;
  const kept = prev.filter(
    (p) => inPage.has(p.id) || p.id === keepId || (!complete && oldest && newer(p, oldest) > 0),
  );
  const have = new Set(kept.map((p) => p.id));
  const added = page.filter((p) => !have.has(p.id));
  return [...kept, ...added].sort(newer);
}

/** Re-sign one post's media URLs (best effort: a failed path keeps its old URL). */
async function resignPost(post: FeedPost): Promise<FeedPost> {
  const [videoUrl, posterUrl, imageUrl] = await Promise.all([
    post.videoPath ? signMediaPath(post.videoPath) : null,
    post.posterPath ? signMediaPath(post.posterPath) : null,
    post.imagePath ? signMediaPath(post.imagePath) : null,
  ]);
  return {
    ...post,
    videoUrl: videoUrl ?? post.videoUrl,
    posterUrl: posterUrl ?? post.posterUrl,
    imageUrl: imageUrl ?? post.imageUrl,
  };
}

function reelSourceOf(row: Row | undefined): ReelSource | null {
  if (!row || row.kind !== 'post') return null;
  const p = row.post;
  return p.kind === 'reel' && p.videoUrl ? { key: p.id, uri: p.videoUrl } : null;
}

// Web: marks a snap target for the scroll-snap CSS in +html.tsx (ignored on native).
const pageMark = { dataSet: { reelPage: '1' } } as object;

type Row =
  | { kind: 'post'; key: string; post: FeedPost }
  | { kind: 'end'; key: string }
  | { kind: 'more-error'; key: string }
  | { kind: 'more-loading'; key: string };

/** A full-page message on the dark stage (loading, empty, error, end of feed). */
function Page({
  height,
  title,
  message,
  spinner,
  action,
  bottomInset,
}: {
  height: number;
  title?: string;
  message?: string;
  spinner?: boolean;
  action?: { label: string; onPress: () => void };
  bottomInset: number;
}) {
  return (
    <View style={[styles.page, { height, paddingBottom: bottomInset }]} {...pageMark}>
      <LogoMark size={88} />
      {spinner ? <ActivityIndicator color={c.primary} /> : null}
      {title ? (
        <Text variant="title" tone="onMedia" align="center">
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text tone="onMediaMuted" align="center" style={styles.pageMessage}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <View style={{ width: 200 }}>
          <Button title={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function LoadingPage({ height, width }: { height: number; width: number }) {
  return (
    <View
      accessibilityLabel="Loading feed"
      style={{
        height,
        width,
        backgroundColor: c.surface,
        justifyContent: 'flex-end',
        padding: 20,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={{ gap: 6 }}>
          <Skeleton width={120} height={12} />
          <Skeleton width={80} height={10} />
        </View>
      </View>
      <Skeleton width="70%" height={12} />
      <Skeleton width="45%" height={12} />
      <View style={{ height: 96 }} />
    </View>
  );
}

/** Full-screen reels feed with a pooled video player (see player/PlayerPool.tsx). */
export function ReelsFeed(props: Props) {
  return (
    <PlayerPoolProvider>
      <ReelsFeedInner {...props} />
    </PlayerPoolProvider>
  );
}

function ReelsFeedInner({
  title: pageTitle,
  loadPage,
  pageSize = PAGE_SIZE,
  finite,
  emptyPage,
  endPage,
}: Props) {
  const { spacing } = useTheme();
  const { session, handleError } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const bp = useBreakpoint();
  const compact = bp === 'compact';
  const insets = useSafeAreaInsets();
  const navClearance = useNavClearance();
  const scheme = useColorScheme();
  const win = useWindowDimensions();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  // Pagination failed: show a final page with Retry and stop onEndReached from looping.
  const [moreError, setMoreError] = useState(false);
  // Author ids I follow (state only, never counts). Loaded in one query per page.
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const followInFlight = useRef(new Set<string>());
  const [size, setSize] = useState({ w: win.width, h: win.height });
  // The settled page. Changes once per settle, never during a swipe.
  const [settled, setSettled] = useState(0);
  const pool = usePlayerPool();
  /** Live page index during a swipe (UI thread for pager B). Read by worklets only. */
  const liveIndex = useSharedValue(0);
  const loadingMoreRef = useRef(false);
  const inFlight = useRef(new Set<string>());
  const hasPosts = useRef(false);
  const refreshRef = useRef<(pull?: boolean) => Promise<void>>(async () => {});
  const listRef = useRef<FlashListRef<Row>>(null);
  const indexRef = useRef(0);
  const countRef = useRef(0);
  const firstIdRef = useRef<string | undefined>(undefined);
  const postsRef = useRef<FeedPost[]>([]);
  /** When each post's signed URLs were issued (ms), by post id. */
  const signedAt = useRef(new Map<string, number>());
  const loadRetried = useRef(new Set<string>());

  useEffect(() => {
    firstIdRef.current = posts[0]?.id;
    postsRef.current = posts;
    const now = Date.now();
    for (const p of posts) if (!signedAt.current.has(p.id)) signedAt.current.set(p.id, now);
  }, [posts]);

  /** Swap fresh URLs into the list for these posts (by id). */
  const applyResigned = useCallback((fresh: FeedPost[]) => {
    const now = Date.now();
    const byId = new Map(fresh.map((p) => [p.id, p]));
    for (const p of fresh) signedAt.current.set(p.id, now);
    setPosts((prev) =>
      prev.map((p) => {
        const f = byId.get(p.id);
        return f
          ? { ...p, videoUrl: f.videoUrl, posterUrl: f.posterUrl, imageUrl: f.imageUrl }
          : p;
      }),
    );
  }, []);

  // A slot failed to load its source (often an expired signed URL): re-sign once and let it retry.
  useEffect(() => {
    pool.onLoadFailed = (key) => {
      if (loadRetried.current.has(key)) return;
      loadRetried.current.add(key);
      const post = postsRef.current.find((p) => p.id === key);
      if (post) void resignPost(post).then((f) => applyResigned([f]));
    };
    return () => {
      pool.onLoadFailed = null;
    };
  }, [pool, applyResigned]);

  useEffect(() => {
    hasPosts.current = posts.length > 0;
  }, [posts.length]);

  const refresh = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const page = await loadPage(me);
        const follows = await fetchFollowing(
          me,
          page.map((p) => p.author_id),
        ).catch(() => null);
        // New posts on top shift the list (content-position keeping); if they were at the top, stay there.
        const wasTop = indexRef.current === 0;
        const prev = postsRef.current;
        if (pull || prev.length === 0) {
          const newTop = page[0]?.id !== firstIdRef.current;
          setPosts(page);
          if (wasTop && newTop) {
            const top = () => listRef.current?.scrollToOffset({ offset: 0, animated: false });
            setTimeout(top, 0);
            setTimeout(top, 200);
          }
          setHasMore(!finite && page.length === pageSize);
        } else {
          // Merge: new posts slot in, everything already loaded (pages, index) stays put.
          const keepId = prev[indexRef.current]?.id;
          const merged = mergeFeed(prev, page, pageSize, keepId);
          const now = Date.now();
          const stale = merged.filter(
            (p) => now - (signedAt.current.get(p.id) ?? now) > URL_MAX_AGE_MS,
          );
          const fresh = new Map(page.map((p) => [p.id, p]));
          const resigned = await Promise.all(stale.map((p) => fresh.get(p.id) ?? resignPost(p)));
          const changed =
            merged.length !== prev.length || merged.some((p, i) => p.id !== prev[i]?.id);
          if (changed) {
            // Keep the reader on the same reel: rows may have been inserted above it.
            const at = keepId ? merged.findIndex((p) => p.id === keepId) : -1;
            if (at >= 0) indexRef.current = at;
            const byId = new Map(prev.map((p) => [p.id, p]));
            setPosts(merged.map((p) => byId.get(p.id) ?? p));
            if (REEL_PAGER === 'scrollview') {
              scrollRef.current?.scrollTo({ y: indexRef.current * pageHRef.current, animated: false });
            } else if (indexRef.current === 0) {
              const top = () => listRef.current?.scrollToOffset({ offset: 0, animated: false });
              setTimeout(top, 0);
              setTimeout(top, 200);
            }
          }
          if (resigned.length > 0) applyResigned(resigned);
        }
        if (follows) setFollowing((old) => new Set([...old, ...follows]));
        setMoreError(false);
        setError(null);
        if (pull) listRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch (e) {
        const ue = handleError(e, 'feed refresh');
        setError(ue);
        // Keep what is on screen; tell the user without wiping the list.
        if (hasPosts.current && ue.kind !== 'session') {
          toast.show({
            message: `Couldn't refresh. ${ue.message}`,
            actionLabel: 'Retry',
            onAction: () => void refreshRef.current(true),
          });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [me, handleError, toast, loadPage, finite, pageSize, applyResigned],
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Reload whenever the tab gains focus (e.g. after posting). The feed is an always-dark viewer.
  useFocusEffect(
    useCallback(() => {
      // Refresh the Home author set first so a follow made elsewhere shows up in this reload.
      void refreshHomeAuthors(me)
        .catch(() => undefined)
        .then(() => refresh());
      setStatusBarStyle('light');
      pool.setSuspended('blur', false);
      return () => {
        pool.setSuspended('blur', true);
        setStatusBarStyle(scheme === 'light' ? 'dark' : 'light');
      };
    }, [refresh, scheme, pool, me]),
  );

  // ...and when the connection comes back or the app returns to the foreground.
  useRevalidate(() => void refresh());

  async function loadMore() {
    if (loadingMoreRef.current || !hasMore || moreError || posts.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await loadPage(me, cursorOf(posts[posts.length - 1]));
      const more = await fetchFollowing(
        me,
        page.map((p) => p.author_id),
      ).catch(() => null);
      if (more) setFollowing((prev) => new Set([...prev, ...more]));
      setHasMore(page.length === pageSize);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.filter((p) => !seen.has(p.id))];
      });
    } catch (e) {
      handleError(e, 'feed load more');
      setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  /** `only` = 'like' makes it a like-only action (double-tap never unlikes). */
  async function toggleLike(post: FeedPost, only?: 'like') {
    // One in-flight request per post: ignore taps until it settles.
    if (inFlight.current.has(post.id)) return;
    if (only === 'like' && post.likedByMe) return;
    inFlight.current.add(post.id);
    const next = !post.likedByMe;
    const apply = (liked: boolean) =>
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likedByMe: liked } : p)));
    apply(next);
    try {
      await setLike(post.id, me, next);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (next && code === '23505') {
        // Already liked on the server: the desired state holds, nothing to roll back.
      } else {
        apply(!next);
        const ue = handleError(e, 'like');
        toast.show({ message: `Couldn't ${next ? 'like' : 'unlike'} that. ${ue.message}` });
      }
    } finally {
      inFlight.current.delete(post.id);
    }
  }

  async function toggleFollow(authorId: string) {
    if (authorId === me || followInFlight.current.has(authorId)) return;
    followInFlight.current.add(authorId);
    const next = !following.has(authorId);
    const apply = (on: boolean) =>
      setFollowing((prev) => {
        const s = new Set(prev);
        if (on) s.add(authorId);
        else s.delete(authorId);
        return s;
      });
    apply(next);
    try {
      await setFollow(me, authorId, next);
      // Home is built from follows: re-read the author set so it reflects this immediately.
      void refreshHomeAuthors(me).catch(() => undefined);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (next && code === '23505') {
        // Already following on the server: the desired state holds, nothing to roll back.
      } else {
        apply(!next);
        const ue = handleError(e, 'follow');
        toast.show({ message: `Couldn't ${next ? 'follow' : 'unfollow'}. ${ue.message}` });
      }
    } finally {
      followInFlight.current.delete(authorId);
    }
  }

  // Stable callbacks so memoized pages skip re-rendering on settle.
  const actions = useRef({ toggleLike, toggleFollow, loadMore });
  useEffect(() => {
    actions.current = { toggleLike, toggleFollow, loadMore };
  });
  const onToggleLike = useCallback((p: FeedPost) => void actions.current.toggleLike(p), []);
  const onDoubleTapLike = useCallback(
    (p: FeedPost) => void actions.current.toggleLike(p, 'like'),
    [],
  );
  const onToggleFollow = useCallback(
    (authorId: string) => void actions.current.toggleFollow(authorId),
    [],
  );

  const rows: Row[] = useMemo(() => {
    const r: Row[] = posts.map((post) => ({ kind: 'post', key: post.id, post }));
    if (posts.length > 0) {
      if (moreError) r.push({ kind: 'more-error', key: 'more-error' });
      else if (loadingMore) r.push({ kind: 'more-loading', key: 'more-loading' });
      else if (!hasMore) r.push({ kind: 'end', key: 'end' });
    }
    return r;
  }, [posts, moreError, loadingMore, hasMore]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    countRef.current = rows.length;
    rowsRef.current = rows;
  }, [rows]);

  /** Commit a settled page: one state update, then reassign player slots (current ± 1). */
  const commit = useCallback(
    (raw: number) => {
      const i = Math.max(0, Math.min(rowsRef.current.length - 1, raw));
      indexRef.current = i;
      setSettled(i);
      const r = rowsRef.current;
      pool.settle(
        reelSourceOf(r[i]),
        [reelSourceOf(r[i + 1]), reelSourceOf(r[i - 1])].filter((x): x is ReelSource => !!x),
      );
    },
    [pool],
  );

  // Data changed (first load, refresh, next page, like): re-settle on the same page.
  useEffect(() => {
    if (rows.length > 0) commit(indexRef.current);
  }, [rows, commit]);

  // Pager B has no onEndReached: ask for the next page when settling near the end.
  useEffect(() => {
    if (REEL_PAGER === 'scrollview' && rows.length > 0 && settled >= rows.length - 3) {
      void actions.current.loadMore();
    }
  }, [settled, rows.length]);

  // Web fallback: no momentum-end events, so commit once scrolling goes idle.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleWhenIdle = useCallback(
    (y: number, h: number) => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => commit(Math.round(y / h)), WEB_SETTLE_IDLE_MS);
    },
    [commit],
  );
  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  // Web: scroll-snap can latch onto page 2 while the first cell is still unmeasured; pin to the top once.
  const pinned = useRef(false);
  const ready = !loading && posts.length > 0;
  useEffect(() => {
    if (!ready || pinned.current) return;
    pinned.current = true;
    const pin = () => {
      if (indexRef.current === 0) listRef.current?.scrollToOffset({ offset: 0, animated: false });
    };
    const t = [setTimeout(pin, 0), setTimeout(pin, 250)];
    return () => t.forEach(clearTimeout);
  }, [ready]);

  const scrollRef = useRef<Animated.ScrollView>(null);
  const pageHRef = useRef(0);
  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(countRef.current - 1, i));
    indexRef.current = next;
    if (REEL_PAGER === 'scrollview') {
      scrollRef.current?.scrollTo({ y: next * pageHRef.current, animated: true });
    } else {
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }
  }, []);

  // Desktop keyboard: ArrowDown/J next, ArrowUp/K previous. Never while typing in a field.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || compact) return;
      const onKey = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          goTo(indexRef.current + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          goTo(indexRef.current - 1);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [compact, goTo]),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  };

  const pageH = Math.round(size.h);
  useEffect(() => {
    pageHRef.current = pageH;
  }, [pageH]);

  // Pager B: scroll position lives on the UI thread; JS hears about it once per settle.
  const isWeb = Platform.OS === 'web';
  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        liveIndex.value = Math.round(e.contentOffset.y / pageH);
        if (isWeb) scheduleOnRN(settleWhenIdle, e.contentOffset.y, pageH);
      },
      onMomentumEnd: (e) => {
        scheduleOnRN(commit, Math.round(e.contentOffset.y / pageH));
      },
    },
    [pageH, isWeb, settleWhenIdle, commit],
  );

  const renderRow = (item: Row, i: number) => {
    if (item.kind === 'post') {
      return (
        <ReelPage
          post={item.post}
          variant={compact ? 'full' : 'card'}
          width={size.w}
          height={pageH}
          active={Math.abs(i - settled) <= 1}
          bottomInset={bottomInset}
          onToggleLike={onToggleLike}
          onDoubleTapLike={onDoubleTapLike}
          showFollow={item.post.author_id !== me && !!item.post.author}
          following={following.has(item.post.author_id)}
          onToggleFollow={onToggleFollow}
        />
      );
    }
    if (item.kind === 'end') {
      if (endPage) return <>{endPage({ height: pageH, width: size.w, bottomInset })}</>;
      return (
        <Page
          height={pageH}
          bottomInset={bottomInset}
          title="You're all caught up."
          message="That's everyone for now. Come back later."
        />
      );
    }
    if (item.kind === 'more-error') {
      return (
        <Page
          height={pageH}
          bottomInset={bottomInset}
          title="Couldn't load more"
          message="Check your connection and try again."
          action={{
            label: 'Retry',
            onPress: () => {
              setMoreError(false);
              void loadMore();
            },
          }}
        />
      );
    }
    return <Page height={pageH} bottomInset={bottomInset} spinner />;
  };
  const bottomInset = compact ? navClearance : 0;
  const top = insets.top + spacing.sm;

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingPage height={pageH} width={size.w} />;
  } else if (error && posts.length === 0) {
    body = (
      <Page
        height={pageH}
        bottomInset={bottomInset}
        title={error.title}
        message={error.message}
        action={{
          label: 'Retry',
          onPress: () => {
            setLoading(true);
            void refresh();
          },
        }}
      />
    );
  } else if (posts.length === 0 && emptyPage) {
    body = emptyPage({ height: pageH, width: size.w, bottomInset });
  } else if (posts.length === 0) {
    body = (
      <Page
        height={pageH}
        bottomInset={bottomInset}
        title="Nothing here yet"
        message="Post something or come back later."
      />
    );
  } else if (REEL_PAGER === 'scrollview') {
    body = (
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={pageH}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        {...({ dataSet: { reels: '1' } } as object)}
      >
        {rows.map((item, i) =>
          Math.abs(i - settled) <= SCROLLVIEW_WINDOW ? (
            <View key={item.key}>{renderRow(item, i)}</View>
          ) : (
            <View key={item.key} style={{ height: pageH }} {...pageMark} />
          ),
        )}
      </Animated.ScrollView>
    );
  } else {
    body = (
      <FlashList<Row>
        ref={listRef}
        data={rows}
        extraData={{ settled, pageH, w: size.w, compact, following }}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.kind}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={pageH}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        // No React state here: a shared-value write only (JS thread for FlashList).
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          liveIndex.value = Math.round(y / pageH);
          if (isWeb) settleWhenIdle(y, pageH);
        }}
        onMomentumScrollEnd={(e) => commit(Math.round(e.nativeEvent.contentOffset.y / pageH))}
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={({ viewableItems }) => {
          const first = viewableItems[0]?.index;
          if (typeof first === 'number' && first !== indexRef.current) commit(first);
        }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        // Web: our +html.tsx CSS adds scroll-snap to the list's direct children.
        {...({ dataSet: { reels: '1' } } as object)}
        renderItem={({ item, index: i }) => renderRow(item, i)}
      />
    );
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      <PageTitle title={pageTitle} />
      {body}
      {compact ? (
        <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: top }]}>
          <Brand size={32} />
          <IconButton
            icon="refresh"
            label="Refresh feed"
            onMedia
            disabled={refreshing || loading}
            onPress={() => void refresh(true)}
          />
        </View>
      ) : (
        <View pointerEvents="box-none" style={[styles.topBar, styles.topBarDesktop]}>
          <IconButton
            icon="refresh"
            label="Refresh feed"
            onMedia
            disabled={refreshing || loading}
            onPress={() => void refresh(true)}
          />
        </View>
      )}
      <PerfOverlay />
      {compact ? (
        <LinearGradient
          pointerEvents="none"
          colors={[c.scrimTop, c.scrimClear]}
          style={[styles.topScrim, { height: top + 64 }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
    backgroundColor: c.surface,
  },
  pageMessage: { maxWidth: 320 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBarDesktop: { justifyContent: 'flex-end', paddingTop: 12 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
});
