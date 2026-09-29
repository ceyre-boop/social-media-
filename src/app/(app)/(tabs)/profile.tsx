import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchUserPosts, type FeedPost } from '@/lib/posts';
import { colors, spacing } from '@/lib/theme';

export default function Profile() {
  const { session, profile, signOut } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const me = session!.user.id;

  useFocusEffect(
    useCallback(() => {
      fetchUserPosts(me, me)
        .then((p) => {
          setPosts(p);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load posts.'));
    }, [me]),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.displayName}>{profile?.display_name || profile?.username}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            title="Edit profile"
            variant="secondary"
            onPress={() => router.push('/profile-edit')}
          />
        </View>
        <View style={styles.flex}>
          <Button title="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.grid}>
        {posts.map((p) => (
          <View key={p.id} style={styles.cell}>
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={styles.cellImage} contentFit="cover" />
            ) : null}
          </View>
        ))}
      </View>
      {!error && posts.length === 0 ? <Text style={styles.empty}>No posts yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg, flexGrow: 1 },
  header: { gap: spacing.xs },
  displayName: { fontSize: 24, fontWeight: '800', color: colors.text },
  username: { fontSize: 15, color: colors.muted },
  bio: { fontSize: 15, color: colors.text, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  cell: { width: '33%', flexGrow: 1, aspectRatio: 1, backgroundColor: colors.surface },
  cellImage: { width: '100%', height: '100%' },
  empty: { color: colors.muted, textAlign: 'center' },
  error: { color: colors.danger },
});
