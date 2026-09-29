import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { LikeButton } from '@/components/like-button';
import { Avatar, Chip } from '@/components/ui';
import { useBreakpoint } from '@/lib/layout';
import { signImagePath, type FeedPost } from '@/lib/posts';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/validation';
import { VISIBILITY_META } from '@/lib/visibility';

const CAPTION_LINES = 4;
const CAPTION_LINE_HEIGHT = 21;

function Caption({ text }: { text: string }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  // Full height measured off-screen: onTextLayout is not available on web.
  const [fullHeight, setFullHeight] = useState(0);
  const needsMore = fullHeight > CAPTION_LINES * CAPTION_LINE_HEIGHT + 2;
  const textStyle = [styles.caption, { color: colors.text }];

  return (
    <View>
      <Text selectable style={textStyle} numberOfLines={expanded ? undefined : CAPTION_LINES}>
        {text}
      </Text>
      <Text
        style={[textStyle, styles.measure]}
        onLayout={(e) => setFullHeight(e.nativeEvent.layout.height)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>
      {needsMore && !expanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show full caption"
          onPress={() => setExpanded(true)}
          hitSlop={8}
          style={styles.more}
        >
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 15 }}>more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PostCard({ post, onToggleLike }: { post: FeedPost; onToggleLike: () => void }) {
  const [fix, setFix] = useState<{ from: string | null; url: string | null } | null>(null);
  const retried = useRef<string | null>(null);
  // A re-signed URL only applies to the URL it replaced; a fresh feed load wins.
  const imageUrl = fix && fix.from === post.imageUrl ? fix.url : post.imageUrl;

  function onImageError() {
    if (!post.imagePath || retried.current === post.imageUrl) return;
    retried.current = post.imageUrl;
    const from = post.imageUrl;
    void signImagePath(post.imagePath).then((url) => setFix({ from, url }));
  }

  const { colors, radius, spacing } = useTheme();
  const compact = useBreakpoint() === 'compact';
  const { height: windowHeight } = useWindowDimensions();
  const username = post.author?.username ?? 'unknown';
  const name = post.author?.display_name || post.author?.username || 'Unknown';
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;

  const imageBox = [
    styles.image,
    {
      aspectRatio: post.aspectRatio,
      maxHeight: compact ? undefined : windowHeight * 0.7,
      borderRadius: compact ? 0 : radius.lg,
      backgroundColor: colors.surface2,
    },
  ];

  return (
    <View style={[styles.card, { borderBottomColor: colors.border, paddingVertical: spacing.lg }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <Avatar username={username} displayName={post.author?.display_name} size={40} />
        <View style={styles.who}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
            {name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>
            {post.author ? `@${post.author.username} · ` : ''}
            {relativeTime(post.created_at)}
          </Text>
        </View>
        {vis ? <Chip label={vis.label} icon={vis.icon} /> : null}
      </View>

      {imageUrl ? (
        <View style={{ paddingHorizontal: compact ? 0 : spacing.lg }}>
          <Image
            source={{ uri: imageUrl }}
            onError={onImageError}
            style={imageBox}
            contentFit="cover"
            recyclingKey={post.id}
            accessibilityLabel={post.caption ? `Photo: ${post.caption}` : 'Photo'}
          />
        </View>
      ) : post.imagePath ? (
        <View style={{ paddingHorizontal: compact ? 0 : spacing.lg }}>
          <View style={[imageBox, styles.placeholder]}>
            <Text style={{ color: colors.muted }}>Image unavailable</Text>
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: spacing.sm }}>
        <LikeButton liked={post.likedByMe} onPress={onToggleLike} />
      </View>

      {post.caption ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Caption text={post.caption} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
  image: { width: '100%', overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 15, lineHeight: CAPTION_LINE_HEIGHT },
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0, pointerEvents: 'none' },
  more: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
});
