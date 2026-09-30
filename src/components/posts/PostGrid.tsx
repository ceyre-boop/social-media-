import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { FeedPost } from '@/lib/posts';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function Thumb({
  post,
  owner,
  onOpen,
}: {
  post: FeedPost;
  /** Spoken prefix: "Your" on You, "Their" on someone else's profile. */
  owner: string;
  onOpen?: (post: FeedPost) => void;
}) {
  const { colors, stage, spacing, radius } = useTheme();
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;
  const duration =
    post.kind === 'reel' && post.durationMs !== null ? formatDuration(post.durationMs) : null;
  const label =
    post.kind === 'reel'
      ? [`${owner} reel`, duration, post.caption].filter(Boolean).join(', ')
      : (post.caption ?? `${owner} post`);
  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole={onOpen ? 'link' : undefined}
        accessible
        accessibilityLabel={label}
        disabled={!onOpen}
        onPress={() => onOpen?.(post)}
        style={[
          StyleSheet.absoluteFill,
          styles.inner,
          { backgroundColor: colors.surface2, borderRadius: radius.xs },
        ]}
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
      </Pressable>
    </View>
  );
}

/** Three-column tile grid: reels (poster + play glyph + duration), images, and text tiles. */
export function PostGrid({
  posts,
  owner,
  onOpen,
}: {
  posts: FeedPost[];
  owner: 'Your' | 'Their';
  onOpen?: (post: FeedPost) => void;
}) {
  return (
    <View style={styles.grid}>
      {posts.map((p) => (
        <Thumb key={p.id} post={p} owner={owner} onOpen={onOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 1 },
  // 3 columns on every size; the 1px padding on each side gives a 2px gutter.
  cell: { width: '33.3333%', aspectRatio: 1 },
  inner: { margin: 1, overflow: 'hidden', cursor: 'pointer' },
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
