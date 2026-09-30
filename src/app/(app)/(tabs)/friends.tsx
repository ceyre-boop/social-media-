import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar, Avatar, Button, Card, IconButton, Text, TextField } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';
import {
  FRIEND_ACTION_FAILED,
  askForFriendNotifications,
  fetchFriendships,
  normalizeUsername,
  removeFriend,
  requestFriend,
  respondFriend,
  type Friendship,
  type PersonBasics,
} from '@/lib/friends';
import { useNavClearance } from '@/lib/layout';
import { searchUsers } from '@/lib/search';
import { useTheme } from '@/lib/theme';

function nameOf(p: { display_name: string | null; username: string }) {
  return p.display_name || p.username;
}

function PersonLine({ person, children }: { person: PersonBasics; children?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.line, { gap: spacing.md }]}>
      <Avatar username={person.username} displayName={person.display_name} size="md" />
      <View style={{ flex: 1 }}>
        <Text variant="callout" numberOfLines={1}>
          {nameOf(person)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <View style={[styles.line, { gap: spacing.sm }]}>{children}</View>
    </View>
  );
}

/**
 * Add friends for Moments: exact username lookup (not search), requests to answer, requests you
 * sent, and your friends. No counts anywhere, and nobody else can see this list.
 */
export default function Friends() {
  const { colors, spacing } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const navClearance = useNavClearance();
  const me = session!.user.id;
  const [list, setList] = useState<Friendship[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PersonBasics[] | null | 'none'>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchFriendships()
      .then((rows) => {
        setList(rows);
        if (rows.some((f) => f.status === 'incoming')) askForFriendNotifications();
      })
      .catch(() => setMessage(FRIEND_ACTION_FAILED));
  }, []);
  useFocusEffect(load);

  async function lookUp() {
    if (!query.trim() || looking) return;
    setLooking(true);
    setMessage(null);
    try {
      const rows = await searchUsers(normalizeUsername(query), 10);
      setFound(rows.length ? rows : 'none');
    } catch (e) {
      const limited = (e as { message?: string } | null)?.message?.includes('search_rate_limited');
      setFound('none');
      if (limited) setMessage('That was a lot of searching. Give it a minute.');
    } finally {
      setLooking(false);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setMessage(null);
    try {
      await fn();
      load();
    } catch {
      setMessage(FRIEND_ACTION_FAILED);
    } finally {
      setBusy(null);
    }
  }

  const statusOf = (id: string) => list.find((f) => f.user_id === id)?.status;
  const incoming = list.filter((f) => f.status === 'incoming');
  const outgoing = list.filter((f) => f.status === 'outgoing');
  const friends = list.filter((f) => f.status === 'friends');
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  const foundAction = (p: PersonBasics) => {
    if (p.user_id === me) return <Text tone="muted">That&apos;s you</Text>;
    const s = statusOf(p.user_id);
    if (s === 'friends') return <Text tone="muted">Friends</Text>;
    if (s === 'outgoing') return <Text tone="muted">Request sent</Text>;
    if (s === 'incoming')
      return (
        <Button
          size="sm"
          title="Accept"
          loading={busy === p.user_id}
          onPress={() => void act(p.user_id, () => respondFriend(p.user_id, true))}
        />
      );
    return (
      <Button
        size="sm"
        title="Add friend"
        loading={busy === p.user_id}
        onPress={() => void act(p.user_id, () => requestFriend(p.user_id))}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title="Add friends"
        left={<IconButton icon="chevron-back" label="Back" onPress={back} />}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.xl,
          paddingBottom: navClearance + spacing.lg,
        }}
      >
        <View style={{ gap: spacing.sm }}>
          <Text tone="secondary">
            {`Friends see each other's ${brand.moment.plural}. Look them up by username or name.`}
          </Text>
          <TextField
            label="Username or name"
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setFound(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void lookUp()}
          />
          <Button
            title="Find"
            variant="secondary"
            icon="search"
            loading={looking}
            onPress={() => void lookUp()}
          />
          {found === 'none' ? (
            <Text tone="muted">Nobody by that name. Check the spelling with them.</Text>
          ) : found ? (
            <Card>
              <View style={{ gap: spacing.md }}>
                {found.map((p) => (
                  <PersonLine key={p.user_id} person={p}>
                    {foundAction(p)}
                  </PersonLine>
                ))}
              </View>
            </Card>
          ) : null}
          {message ? <Text tone="danger">{message}</Text> : null}
        </View>

        {incoming.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="headline" accessibilityRole="header">
              Asked to be your friend
            </Text>
            {incoming.map((f) => (
              <PersonLine key={f.user_id} person={f}>
                <Button
                  size="sm"
                  title="Accept"
                  loading={busy === f.user_id}
                  onPress={() => void act(f.user_id, () => respondFriend(f.user_id, true))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  title="Decline"
                  disabled={busy === f.user_id}
                  onPress={() => void act(f.user_id, () => respondFriend(f.user_id, false))}
                />
              </PersonLine>
            ))}
          </View>
        ) : null}

        {outgoing.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="headline" accessibilityRole="header">
              You asked
            </Text>
            {outgoing.map((f) => (
              <PersonLine key={f.user_id} person={f}>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Cancel"
                  loading={busy === f.user_id}
                  onPress={() => void act(f.user_id, () => removeFriend(f.user_id))}
                />
              </PersonLine>
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text variant="headline" accessibilityRole="header">
            Friends
          </Text>
          {friends.length === 0 ? (
            <Text tone="muted">
              {`No friends here yet. When someone accepts, you'll see each other's ${brand.moment.plural}.`}
            </Text>
          ) : (
            friends.map((f) => (
              <PersonLine key={f.user_id} person={f}>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Remove"
                  loading={busy === f.user_id}
                  onPress={() => void act(f.user_id, () => removeFriend(f.user_id))}
                />
              </PersonLine>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
});
