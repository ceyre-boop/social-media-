import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, IconButton, PageTitle, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';
import { fetchMoments, groupByPerson, type Moment } from '@/lib/moments';
import { getMomentsCache, setMomentsCache } from '@/lib/moments/cache';
import { stage as c } from '@/lib/theme';

function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** People in row order, each person's Moments oldest → newest, one flat swipeable list. */
function flatten(list: Moment[], me: string): Moment[] {
  return groupByPerson(list, me).flatMap((p) => [...p.moments].reverse());
}

/**
 * Full-screen Moments: swipe (or tap the sides, or use the arrow keys) to move between Moments and
 * people. No share button, no link, no counts. Nothing auto-advances.
 */
export default function MomentsViewer() {
  const params = useLocalSearchParams<{ person?: string; moment?: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [items, setItems] = useState<Moment[]>(() => flatten(getMomentsCache() ?? [], me));
  const [picked, setIndex] = useState<number | null>(null);
  const placed = useRef(false);

  useEffect(() => {
    fetchMoments(me)
      .then((list) => {
        setMomentsCache(list);
        setItems(flatten(list, me));
      })
      .catch(() => undefined);
  }, [me]);

  const start = useMemo(() => {
    const byMoment = items.findIndex((m) => m.id === params.moment);
    if (byMoment >= 0) return byMoment;
    const byPerson = items.findIndex((m) => m.author_id === params.person);
    return Math.max(byPerson, 0);
  }, [items, params.moment, params.person]);
  const index = picked ?? start;

  useEffect(() => {
    if (placed.current || items.length === 0) return;
    requestAnimationFrame(() => scroller.current?.scrollTo({ x: start * width, animated: false }));
    placed.current = true;
  }, [items.length, start, width]);

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  const go = (i: number) => {
    if (i < 0 || i >= items.length) return close();
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('addEventListener' in window)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const current = items[index];
  const who = (m: Moment) =>
    m.author_id === me ? 'You' : m.author?.display_name || m.author?.username || 'Friend';

  return (
    <View style={styles.root}>
      <PageTitle title={brand.moment.plural} />
      {items.length === 0 ? (
        <View style={[styles.center, { height }]}>
          <Text tone="onMediaMuted">Nothing to show yet.</Text>
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}
          scrollEventThrottle={32}
        >
          {items.map((m) => (
            <View key={m.id} style={{ width, height }}>
              {m.imageUrl ? (
                <Image
                  source={{ uri: m.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  accessibilityLabel={`${who(m)}'s ${brand.moment.singular}${m.caption ? `: ${m.caption}` : ''}`}
                />
              ) : null}
              {m.caption ? (
                <View style={[styles.caption, { paddingBottom: insets.bottom + 24 }]}>
                  <Text tone="onMedia">{m.caption}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Tap zones: left third back, right third forward (never auto-advancing). */}
      {items.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            onPress={() => go(index - 1)}
            style={[styles.zone, { left: 0, width: width / 3 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            onPress={() => go(index + 1)}
            style={[styles.zone, { right: 0, width: width / 3 }]}
          />
        </>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {current ? (
          <View style={styles.who}>
            <Avatar
              username={current.author?.username ?? '?'}
              displayName={current.author?.display_name}
              size="sm"
            />
            <View>
              <Text variant="callout" tone="onMedia">
                {who(current)}
              </Text>
              <Text variant="caption" tone="onMediaMuted">
                {when(current.created_at)}
              </Text>
            </View>
          </View>
        ) : (
          <View />
        )}
        <IconButton icon="close" label="Close" onMedia onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 40,
    backgroundColor: c.scrimBottom,
  },
  zone: { position: 'absolute', top: 96, bottom: 120 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.scrimTop,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
