import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/post-card';
import { useAuth } from '@/lib/auth';
import { PAGE_SIZE, cursorOf, fetchFeedPage, setLike, type FeedPost } from '@/lib/posts';
import { colors, spacing } from '@/lib/theme';

export default function Feed() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMore = useRef(true);
  const loadingMore = useRef(false);
  const inFlight = useRef(new Set<string>());

  const refresh = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      try {
        const page = await fetchFeedPage(me);
        setPosts(page);
        hasMore.current = page.length === PAGE_SIZE;
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the feed.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [me],
  );

  // Reload whenever the tab gains focus (e.g. after posting).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function loadMore() {
    if (loadingMore.current || !hasMore.current || posts.length === 0) return;
    loadingMore.current = true;
    try {
      const page = await fetchFeedPage(me, cursorOf(posts[posts.length - 1]));
      hasMore.current = page.length === PAGE_SIZE;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.filter((p) => !seen.has(p.id))];
      });
    } catch (e) {
      Alert.alert('Could not load more', e instanceof Error ? e.message : 'Try again.');
    } finally {
      loadingMore.current = false;
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
        Alert.alert('Could not update like', e instanceof Error ? e.message : 'Try again.');
      }
    } finally {
      inFlight.current.delete(post.id);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostCard post={item} onToggleLike={() => toggleLike(item)} />}
      refreshing={refreshing}
      onRefresh={() => refresh(true)}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>
            {error ?? 'Nothing here yet. Post something from the New tab.'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.muted, textAlign: 'center' },
});
