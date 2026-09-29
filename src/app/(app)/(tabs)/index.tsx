import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PostCard } from '@/components/post-card';
import { AppBar, EmptyState, PostCardSkeleton, Screen, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { useRevalidate } from '@/lib/network';
import { PAGE_SIZE, cursorOf, fetchFeedPage, setLike, type FeedPost } from '@/lib/posts';
import { useTheme } from '@/lib/theme';

export default function Feed() {
  const { colors, spacing } = useTheme();
  const { session, handleError } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  // Pagination failed: show an inline retry and stop onEndReached from looping.
  const [moreError, setMoreError] = useState(false);
  const refreshRef = useRef<(pull?: boolean) => Promise<void>>(async () => {});
  const loadingMoreRef = useRef(false);
  const inFlight = useRef(new Set<string>());
  const hasPosts = useRef(false);
  useEffect(() => {
    hasPosts.current = posts.length > 0;
  }, [posts.length]);

  const refresh = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const page = await fetchFeedPage(me);
        setPosts(page);
        setHasMore(page.length === PAGE_SIZE);
        setMoreError(false);
        setError(null);
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
    [me, handleError, toast],
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Reload whenever the tab gains focus (e.g. after posting).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // ...and when the connection comes back or the app returns to the foreground.
  useRevalidate(() => void refresh());

  async function loadMore() {
    if (loadingMoreRef.current || !hasMore || moreError || posts.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchFeedPage(me, cursorOf(posts[posts.length - 1]));
      setHasMore(page.length === PAGE_SIZE);
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

  async function toggleLike(post: FeedPost) {
    // One in-flight request per post: ignore taps until it settles.
    if (inFlight.current.has(post.id)) return;
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

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View accessibilityLabel="Loading feed">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </View>
    );
  } else if (error && posts.length === 0) {
    body = (
      <EmptyState
        title={error.title}
        message={error.message}
        actionLabel="Retry"
        onAction={() => {
          setLoading(true);
          refresh();
        }}
      />
    );
  } else {
    body = (
      <FlashList
        style={{ flex: 1 }}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} onToggleLike={() => toggleLike(item)} />}
        refreshing={refreshing}
        onRefresh={() => refresh(true)}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState title="Nothing here yet" message="Post something or come back later." />
        }
        ListFooterComponent={
          posts.length === 0 ? null : moreError ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading more posts"
                onPress={() => {
                  setMoreError(false);
                  void loadMore();
                }}
                style={{ minHeight: 44, justifyContent: 'center', cursor: 'pointer' }}
              >
                <Text style={{ color: colors.muted, fontSize: 15, fontWeight: '600' }}>
                  Couldn&apos;t load more ·{' '}
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text>
                </Text>
              </Pressable>
            </View>
          ) : loadingMore ? (
            <View style={{ padding: spacing.xl }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !hasMore ? (
            <Text
              style={{
                color: colors.muted,
                textAlign: 'center',
                padding: spacing.xxl,
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              You&apos;re all caught up.
            </Text>
          ) : null
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Feed" brand />
      <Screen title="Feed">{body}</Screen>
    </View>
  );
}
