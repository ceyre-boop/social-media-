import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { AppBar, Avatar, Button, EmptyState, IconButton, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';
import { fetchFriendIds } from '@/lib/friends';
import { useNavClearance } from '@/lib/layout';
import { askForMomentPrompts, fetchMoments, isToday, type Moment } from '@/lib/moments';
import { setMomentsCache } from '@/lib/moments/cache';
import { useTheme } from '@/lib/theme';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Today's Moments from you and your friends, then earlier this week. Never strangers. */
export default function MomentsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { session, handleError } = useAuth();
  const router = useRouter();
  const navClearance = useNavClearance();
  const me = session!.user.id;
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [hasFriends, setHasFriends] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(askForMomentPrompts, []);

  const load = useCallback(() => {
    Promise.all([fetchMoments(me), fetchFriendIds()])
      .then(([list, friends]) => {
        setMomentsCache(list);
        setMoments(list);
        setHasFriends(friends.length > 0);
        setError(null);
      })
      .catch((e) => setError(handleError(e, 'moments').message));
  }, [me, handleError]);
  useFocusEffect(load);

  const today = (moments ?? []).filter((m) => isToday(m.created_at));
  const earlier = (moments ?? []).filter((m) => !isToday(m.created_at));
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  const tile = (m: Moment) => {
    const who =
      m.author_id === me ? 'You' : m.author?.display_name || m.author?.username || 'Friend';
    return (
      <Pressable
        key={m.id}
        accessibilityRole="button"
        accessibilityLabel={`${who}, ${timeOf(m.created_at)}${m.caption ? `: ${m.caption}` : ''}`}
        onPress={() =>
          router.push({ pathname: '/moments/view', params: { person: m.author_id, moment: m.id } })
        }
        style={[styles.tile, { borderRadius: radius.md, backgroundColor: colors.surface2 }]}
      >
        {m.imageUrl ? (
          <Image source={{ uri: m.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <View style={[styles.tileMeta, { padding: spacing.sm, gap: spacing.xs }]}>
          <Avatar
            username={m.author?.username ?? '?'}
            displayName={m.author?.display_name}
            size="xs"
          />
          <Text variant="caption" tone="onMedia" numberOfLines={1} style={{ flexShrink: 1 }}>
            {who} · {timeOf(m.created_at)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title={brand.moment.plural}
        left={<IconButton icon="chevron-back" label="Back" onPress={back} />}
        right={
          <IconButton
            icon="person-add-outline"
            label="Add friends"
            onPress={() => router.push('/friends')}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          paddingBottom: navClearance + spacing.lg,
        }}
      >
        <Button
          title={`Share a ${brand.moment.singular}`}
          icon="camera-outline"
          onPress={() => router.push('/moments/new')}
        />
        {error ? <Text tone="danger">{error}</Text> : null}
        {moments && moments.length === 0 && !hasFriends ? (
          <EmptyState
            compact
            title={`${brand.moment.plural} are for friends`}
            message={`A ${brand.moment.singular} is a look at what you're actually up to, shared only with friends you add. Add a few people you know, and theirs will show up here.`}
            actionLabel="Add friends"
            onAction={() => router.push('/friends')}
          />
        ) : null}
        {moments && moments.length === 0 && hasFriends ? (
          <EmptyState
            compact
            title="Nothing yet today"
            message="When you or your friends share something, it shows up here."
          />
        ) : null}
        {today.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="headline" accessibilityRole="header">
              Today
            </Text>
            <View style={[styles.grid, { gap: spacing.sm }]}>{today.map(tile)}</View>
          </View>
        ) : null}
        {earlier.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="headline" accessibilityRole="header">
              Earlier this week
            </Text>
            <View style={[styles.grid, { gap: spacing.sm }]}>{earlier.map(tile)}</View>
          </View>
        ) : null}
        {moments && moments.length > 0 && !hasFriends ? (
          <View style={{ gap: spacing.sm }}>
            <Text tone="muted">
              Only you can see these for now. Add friends and they will see yours, and you theirs.
            </Text>
            <Button
              title="Add friends"
              variant="secondary"
              icon="person-add-outline"
              onPress={() => router.push('/friends')}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '48%', aspectRatio: 3 / 4, overflow: 'hidden', justifyContent: 'flex-end' },
  tileMeta: { flexDirection: 'row', alignItems: 'center' },
});
