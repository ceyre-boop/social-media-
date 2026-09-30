import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';
import { fetchMoments, groupByPerson, type MomentPerson } from '@/lib/moments';
import { setMomentsCache } from '@/lib/moments/cache';
import { stage as c } from '@/lib/theme';

const SIZE = 52;

function Circle({
  label,
  onPress,
  a11y,
  children,
}: {
  label: string;
  onPress: () => void;
  a11y: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
    >
      {children}
      <Text variant="caption" tone="onMediaMuted" numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The quiet stories-style strip at the top of Home: "Share a Moment", your own, then friends' with a
 * Moment this week (latest first). Neutral: no rings, no unread markers, no counts. Never strangers.
 */
export function MomentsRow() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const me = session!.user.id;
  const [people, setPeople] = useState<MomentPerson[]>([]);

  const load = useCallback(() => {
    fetchMoments(me)
      .then((list) => {
        setMomentsCache(list);
        setPeople(groupByPerson(list, me));
      })
      .catch(() => setPeople([]));
  }, [me]);
  useFocusEffect(load);

  const mine = people[0];
  const friends = people.slice(1);
  const open = (person: string) => router.push({ pathname: '/moments/view', params: { person } });

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityLabel={brand.moment.plural}
      >
        <Circle
          label="Share"
          a11y={`Share a ${brand.moment.singular}`}
          onPress={() => router.push('/moments/new')}
        >
          <View style={styles.add}>
            <Ionicons name="camera-outline" size={24} color={c.textSecondary} />
          </View>
        </Circle>
        {mine && mine.moments.length > 0 && profile ? (
          <Circle label="You" a11y={`Your ${brand.moment.plural}`} onPress={() => open(me)}>
            <Avatar username={profile.username} displayName={profile.display_name} size={SIZE} />
          </Circle>
        ) : null}
        {friends.map((p) => (
          <Circle
            key={p.authorId}
            label={p.author?.display_name || p.author?.username || 'Friend'}
            a11y={`${p.author?.display_name || p.author?.username || 'Friend'}'s ${brand.moment.plural}`}
            onPress={() => open(p.authorId)}
          >
            <Avatar
              username={p.author?.username ?? '?'}
              displayName={p.author?.display_name}
              size={SIZE}
            />
          </Circle>
        ))}
        <Circle
          label={friends.length ? 'All' : 'Friends'}
          a11y={friends.length ? `All ${brand.moment.plural}` : 'Add friends'}
          onPress={() => router.push(friends.length ? '/moments' : '/friends')}
        >
          <View style={styles.add}>
            <Ionicons
              name={friends.length ? 'albums-outline' : 'person-add-outline'}
              size={22}
              color={c.textSecondary}
            />
          </View>
        </Circle>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: c.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  strip: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  item: { width: 64, alignItems: 'center', gap: 4 },
  label: { maxWidth: 64 },
  add: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
