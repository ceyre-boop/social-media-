import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppBar, Avatar, Button, EmptyState, PageTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { useRevalidate } from '@/lib/network';
import { fetchUserPosts, type FeedPost } from '@/lib/posts';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

function Thumb({ post }: { post: FeedPost }) {
  const { colors } = useTheme();
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;
  return (
    <View style={styles.cell}>
      <View style={[StyleSheet.absoluteFill, styles.inner, { backgroundColor: colors.surface2 }]}>
        {post.imageUrl ? (
          <Image
            source={{ uri: post.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={post.caption ?? 'Your post'}
          />
        ) : !post.imagePath && post.caption ? (
          // Text-only post: show the words, not an empty tile.
          <View style={styles.textTile}>
            <Text numberOfLines={5} style={[styles.textTileBody, { color: colors.text }]}>
              {post.caption}
            </Text>
          </View>
        ) : null}
        {vis ? (
          <View style={[styles.badge, { backgroundColor: colors.overlay }]}>
            <Ionicons name={vis.icon} size={14} color="#FFFFFF" accessibilityLabel={vis.label} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function linkHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function Profile() {
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
      <PageTitle title="Profile" />
      <AppBar title="Profile" />
      <ScrollView contentContainerStyle={{ paddingBottom: navClearance }}>
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={styles.top}>
            <Avatar username={username} displayName={profile?.display_name} size={88} />
            <View style={styles.names}>
              <Text selectable style={[styles.displayName, { color: colors.text }]}>
                {profile?.display_name || username}
              </Text>
              <Text selectable style={{ color: colors.muted, fontSize: 15 }}>
                @{username}
              </Text>
            </View>
          </View>
          {profile?.bio ? (
            <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
              {profile.bio}
            </Text>
          ) : null}
          {profile?.link_url ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(linkHref(profile.link_url!))}
              style={styles.link}
            >
              <Ionicons name="link-outline" size={16} color={colors.primary} />
              <Text
                numberOfLines={1}
                style={{ color: colors.primary, fontWeight: '600', flexShrink: 1 }}
              >
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
            title={error.title}
            message={error.message}
            actionLabel="Retry"
            onAction={load}
          />
        ) : loaded && posts.length === 0 ? (
          <EmptyState title="No posts yet" message="Your photos will show up here." />
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
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  names: { flex: 1, gap: 2 },
  displayName: { fontSize: 22, fontWeight: '800' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 1 },
  // 3 columns on every size; the 1px padding on each side gives a 2px gutter.
  cell: { width: '33.3333%', aspectRatio: 1 },
  inner: { margin: 1, overflow: 'hidden' },
  textTile: { flex: 1, padding: 10, paddingRight: 30, justifyContent: 'center' },
  textTileBody: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
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
