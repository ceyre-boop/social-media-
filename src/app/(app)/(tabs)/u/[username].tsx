import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/posts/PostGrid';
import { AppBar, Avatar, Button, EmptyState, IconButton, PageTitle, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { fetchFollowing, setFollow } from '@/lib/follows';
import { useNavClearance } from '@/lib/layout';
import { useRevalidate } from '@/lib/network';
import { fetchProfileByUsername, type PublicProfile } from '@/lib/profiles';
import { fetchUserPosts, type FeedPost } from '@/lib/posts';
import { useTheme } from '@/lib/theme';

function linkHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Someone else's profile. The grid is only what RLS lets you see. No counts anywhere. */
export default function UserProfile() {
  const { username: param } = useLocalSearchParams<{ username: string }>();
  const username = Array.isArray(param) ? param[0] : param;
  const navClearance = useNavClearance();
  const { colors, spacing } = useTheme();
  const { session, profile: mine, handleError } = useAuth();
  const router = useRouter();
  const me = session!.user.id;

  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [person, setPerson] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserError | null>(null);

  const load = useCallback(() => {
    if (!username) return;
    fetchProfileByUsername(username)
      .then(async (p) => {
        if (!p) return setState('missing');
        setPerson(p);
        if (p.user_id === me) {
          router.replace('/you');
          return;
        }
        const [list, follows] = await Promise.all([
          fetchUserPosts(me, p.user_id),
          fetchFollowing(me, [p.user_id]),
        ]);
        setPosts(list);
        setFollowing(follows.has(p.user_id));
        setError(null);
        setState('ready');
      })
      .catch((e) => {
        setError(handleError(e, 'user profile'));
        setState('ready');
      });
  }, [username, me, router, handleError]);

  useFocusEffect(load);
  useRevalidate(load);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  async function toggleFollow() {
    if (!person || busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    try {
      await setFollow(me, person.user_id, next);
    } catch (e) {
      setFollowing(!next);
      setError(handleError(e, 'follow'));
    } finally {
      setBusy(false);
    }
  }

  const name = person?.display_name || person?.username || username || '';
  const isMe = !!person && person.username.toLowerCase() === mine?.username.toLowerCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title={person ? name : "Profile"} />
      <AppBar
        title={person ? `@${person.username}` : 'Profile'}
        left={<IconButton icon="chevron-back" label="Back" onPress={back} />}
      />
      {state === 'missing' || (state === 'ready' && !person) ? (
        <EmptyState
          title="We couldn't find that profile"
          message="It may have moved, or you might not be able to see it."
          actionLabel="Go home"
          onAction={() => router.navigate('/')}
        />
      ) : state === 'loading' || !person ? null : (
        <ScrollView contentContainerStyle={{ paddingBottom: navClearance }}>
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <View style={[styles.top, { gap: spacing.lg }]}>
              <Avatar username={person.username} displayName={person.display_name} size="xl" />
              <View style={styles.names}>
                <Text variant="title" selectable>
                  {name}
                </Text>
                <Text tone="muted" selectable>
                  @{person.username}
                </Text>
              </View>
            </View>
            {person.bio ? <Text selectable>{person.bio}</Text> : null}
            {person.link_url ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(linkHref(person.link_url!))}
                style={[styles.link, { gap: spacing.sm - 2 }]}
              >
                <Ionicons name="link-outline" size={16} color={colors.textSecondary} />
                <Text variant="callout" tone="secondary" numberOfLines={1} style={styles.linkText}>
                  {person.link_url.replace(/^https?:\/\//i, '')}
                </Text>
              </Pressable>
            ) : null}
            {isMe ? null : (
              <Button
                title={following ? 'Following' : 'Follow'}
                variant={following ? 'secondary' : 'primary'}
                icon={following ? 'checkmark' : undefined}
                loading={busy}
                onPress={toggleFollow}
              />
            )}
          </View>

          {error && posts.length === 0 ? (
            <EmptyState
              compact
              title={error.title}
              message={error.message}
              actionLabel="Retry"
              onAction={load}
            />
          ) : posts.length === 0 ? (
            <EmptyState title="No posts you can see yet" message="Check back later." />
          ) : (
            <PostGrid posts={posts} owner="Their" />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  names: { flex: 1, gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  linkText: { flexShrink: 1 },
});
