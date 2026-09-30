import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, LogoMark, Text } from '@/components/ui';
import { rainbow, stage } from '@/lib/theme';

import type { FeedPageContext } from './ReelsFeed';

/**
 * Discover's terminal state: a full snap page so it is unmistakable that the feed ended.
 * Deliberately warm and final. Nothing below it, nothing to pull for more.
 */
export function EndOfFeed({ height, bottomInset }: FeedPageContext) {
  const router = useRouter();
  return (
    <View
      style={[styles.page, { height, paddingBottom: bottomInset }]}
      {...({ dataSet: { reelPage: '1' } } as object)}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[stage.warmTop, stage.warmBottom]}
        style={StyleSheet.absoluteFill}
      />
      <LogoMark size={120} />
      {/* A small rainbow, once: this is a finished-line moment, not chrome. */}
      <View
        style={styles.dots}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {rainbow.map((color) => (
          <View key={color} style={[styles.dot, { backgroundColor: color }]} />
        ))}
      </View>
      <Text variant="display" tone="onMedia" align="center" accessibilityRole="header">
        {"That's everything for now"}
      </Text>
      <Text tone="onMediaMuted" align="center" style={styles.body}>
        Go live, make something, or come back tomorrow — there&apos;ll be more.
      </Text>
      <View style={styles.actions}>
        <Button title="Create" icon="add" size="lg" onPress={() => router.navigate('/create')} />
        <Button title="Home" variant="secondary" size="lg" onPress={() => router.navigate('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
    backgroundColor: stage.bg,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { maxWidth: 320 },
  actions: { width: '100%', maxWidth: 280, gap: 12, marginTop: 8 },
});
