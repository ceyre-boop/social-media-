import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/posts/PostGrid';
import { AppBar, Avatar, Button, EmptyState, IconButton, PageTitle, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { fetchFollowing, setFollow } from '@/lib/follows';
import {
  FRIEND_ACTION_FAILED,
  fetchFriendships,
  requestFriend,
  respondFriend,
  type FriendStatus,
  type Friendship,
} from '@/lib/friends';
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
  const [friend, setFriend] = useState<FriendStatus | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

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
        const [list, follows, friendships] = await Promise.all([
          fetchUserPosts(me, p.user_id),
          fetchFollowing(me, [p.user_id]),
          fetchFriendships().catch(() => [] as Friendship[]),
        ]);
        setPosts(list);
        setFollowing(follows.has(p.user_id));
        setFriend(friendships.find((f) => f.user_id === p.user_id)?.status ?? null);
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

  async function friendAction() {
    if (!person || friendBusy || friend === 'friends' || friend === 'outgoing') return;
    setFriendBusy(true);
    setFriendError(null);
    try {
      if (friend === 'incoming') {
        await respondFriend(person.user_id, true);
        setFriend('friends');
      } else {
        setFriend((await requestFriend(person.user_id)) === 'friends' ? 'friends' : 'outgoing');
      }
    } catch {
      setFriendError(FRIEND_ACTION_FAILED);
    } finally {
      setFriendBusy(false);
    }
  }

  const friendLabel =
    friend === 'friends'
      ? 'Friends'
      : friend === 'outgoing'
        ? 'Request sent'
        : friend === 'incoming'
          ? 'Accept friend'
          : 'Add friend';

  const name = person?.display_name || person?.username || username || '';
  const isMe = !!person && person.username.toLowerCase() === mine?.username.toLowerCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title={person ? name : 'Profile'} />
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
              <View style={[styles.actions, { gap: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={following ? 'Following' : 'Follow'}
                    variant={following ? 'secondary' : 'primary'}
                    icon={following ? 'checkmark' : undefined}
                    loading={busy}
                    onPress={toggleFollow}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={friendLabel}
                    variant="secondary"
                    icon={
                      friend === 'friends'
                        ? 'people'
                        : friend === 'outgoing'
                          ? 'time-outline'
                          : 'person-add-outline'
                    }
                    loading={friendBusy}
                    disabled={friend === 'friends' || friend === 'outgoing'}
                    onPress={() => void friendAction()}
                  />
                </View>
              </View>
            )}
            {friendError ? <Text tone="danger">{friendError}</Text> : null}
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
            <PostGrid
              posts={posts}
              owner="Their"
              onOpen={(p) => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row' },
  names: { flex: 1, gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  linkText: { flexShrink: 1 },
});
