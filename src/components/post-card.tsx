import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedPost } from '@/lib/posts';
import { colors, spacing } from '@/lib/theme';
import { relativeTime } from '@/lib/validation';

export function PostCard({ post, onToggleLike }: { post: FeedPost; onToggleLike: () => void }) {
  const name = post.author?.display_name || post.author?.username || 'Unknown';
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        {post.author ? <Text style={styles.username}>@{post.author.username}</Text> : null}
      </View>
      {post.imageUrl ? (
        <Image
          source={{ uri: post.imageUrl }}
          style={[styles.image, { aspectRatio: post.aspectRatio }]}
          contentFit="cover"
          recyclingKey={post.id}
        />
      ) : post.imagePath ? (
        <View style={[styles.image, styles.placeholder, { aspectRatio: post.aspectRatio }]}>
          <Text style={styles.time}>Image unavailable</Text>
        </View>
      ) : null}
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? 'Unlike' : 'Like'}
          onPress={onToggleLike}
          hitSlop={8}
          style={[styles.likeButton, post.likedByMe && styles.likeButtonActive]}
        >
          <Text style={styles.likeText}>{post.likedByMe ? 'Liked' : 'Like'}</Text>
        </Pressable>
        <Text style={styles.time}>{relativeTime(post.created_at)}</Text>
      </View>
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  username: { fontSize: 13, color: colors.muted },
  image: { width: '100%', backgroundColor: colors.surface },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  likeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  likeButtonActive: { backgroundColor: colors.accent },
  likeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  caption: { paddingHorizontal: spacing.md, fontSize: 15, color: colors.text },
});
