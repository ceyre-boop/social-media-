import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppBar, Avatar, Button, EmptyState, PageTitle, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { useRevalidate } from '@/lib/network';
import { fetchUserPosts, type FeedPost } from '@/lib/posts';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function Thumb({ post }: { post: FeedPost }) {
  const { colors, stage, spacing, radius } = useTheme();
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;
  const duration =
    post.kind === 'reel' && post.durationMs !== null ? formatDuration(post.durationMs) : null;
  const reelLabel = ['Your reel', duration, post.caption].filter(Boolean).join(', ');
  const reelAccessibility =
    post.kind === 'reel' ? { accessible: true, accessibilityLabel: reelLabel } : {};
  return (
    <View style={styles.cell}>
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.inner,
          { backgroundColor: colors.surface2, borderRadius: radius.xs },
        ]}
        {...reelAccessibility}
      >
        {post.kind === 'reel' ? (
          <>
            {post.posterUrl ? (
              <Image
                source={{ uri: post.posterUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View style={styles.reelFallback}>
                <Ionicons name="videocam-outline" size={28} color={colors.muted} />
              </View>
            )}
            <View
              style={[
                styles.duration,
                { backgroundColor: stage.control, borderRadius: radius.pill, gap: spacing.xxs },
              ]}
            >
              <Ionicons name="play" size={10} color={stage.text} />
              {duration ? (
                <Text variant="micro" tone="onMedia" style={styles.durationText}>
                  {duration}
                </Text>
              ) : null}
            </View>
          </>
        ) : post.imageUrl ? (
          <Image
            source={{ uri: post.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={post.caption ?? 'Your post'}
          />
        ) : !post.imagePath && post.caption ? (
          // Text-only post: show the words, not an empty tile.
          <View style={[styles.textTile, { padding: spacing.md, paddingRight: spacing.xxxl - 2 }]}>
            <Text variant="caption" weight="600" numberOfLines={5}>
              {post.caption}
            </Text>
          </View>
        ) : null}
        {vis ? (
          <View style={[styles.badge, { backgroundColor: stage.control }]}>
            <Ionicons name={vis.icon} size={14} color={stage.text} accessibilityLabel={vis.label} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function linkHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** You: your profile. Private view of your own posts. No counts. */
export default function You() {
  const navClearance = useNavClearance();
  const { colors, spacing } = useTheme();
  const { session, profile, handleError } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<UserError | null>(null);
  const me = session!.user.id;

  const load = useCallback(() => {
    fetchUserPosts(me, me)
      .then((p) => {
        setPosts(p);
        setError(null);
      })
      .catch((e) => setError(handleError(e, 'profile posts')))
      .finally(() => setLoaded(true));
  }, [me, handleError]);

  useFocusEffect(load);
  useRevalidate(load);

  const username = profile?.username ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title="You" />
      <AppBar title="You" />
      <ScrollView contentContainerStyle={{ paddingBottom: navClearance }}>
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={[styles.top, { gap: spacing.lg }]}>
            <Avatar username={username} displayName={profile?.display_name} size="xl" />
            <View style={styles.names}>
              <Text variant="title" selectable>
                {profile?.display_name || username}
              </Text>
              <Text tone="muted" selectable>
                @{username}
              </Text>
            </View>
          </View>
          {profile?.bio ? <Text selectable>{profile.bio}</Text> : null}
          {profile?.link_url ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(linkHref(profile.link_url!))}
              style={[styles.link, { gap: spacing.sm - 2 }]}
            >
              <Ionicons name="link-outline" size={16} color={colors.textSecondary} />
              <Text variant="callout" tone="secondary" numberOfLines={1} style={styles.linkText}>
                {profile.link_url.replace(/^https?:\/\//i, '')}
              </Text>
            </Pressable>
          ) : null}
          <Button
            title="Edit profile"
            variant="secondary"
            icon="create-outline"
            onPress={() => router.push('/profile-edit')}
          />
        </View>

        {error && posts.length === 0 ? (
          <EmptyState
            compact
            title={error.title}
            message={error.message}
            actionLabel="Retry"
            onAction={load}
          />
        ) : loaded && posts.length === 0 ? (
          <EmptyState title="No posts yet" message="Your photos and reels will show up here." />
        ) : (
          <View style={styles.grid}>
            {posts.map((p) => (
              <Thumb key={p.id} post={p} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  names: { flex: 1, gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  linkText: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 1 },
  // 3 columns on every size; the 1px padding on each side gives a 2px gutter.
  cell: { width: '33.3333%', aspectRatio: 1 },
  inner: { margin: 1, overflow: 'hidden' },
  textTile: { flex: 1, justifyContent: 'center' },
  reelFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  duration: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  durationText: { letterSpacing: 0 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
