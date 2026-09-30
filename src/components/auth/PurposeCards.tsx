import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { Button, Text } from '@/components/ui';
import { purposeCards } from '@/config/purposeCards';
import { useTheme } from '@/lib/theme';

/** Swipeable, skippable cards with dots. Neutral surfaces, one icon per card. */
export function PurposeCards({ onDone }: { onDone: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const last = index === purposeCards.length - 1;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function goTo(i: number) {
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  }

  return (
    <View style={{ gap: spacing.xl }}>
      <View onLayout={onLayout}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {purposeCards.map((c) => (
            <View
              key={c.headline}
              style={{ width: width || undefined, minWidth: width ? undefined : 280 }}
            >
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    gap: spacing.lg,
                    marginHorizontal: 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: colors.surface2, borderRadius: radius.md },
                  ]}
                >
                  <Ionicons name={c.icon} size={24} color={colors.textSecondary} />
                </View>
                <Text variant="headline">{c.headline}</Text>
                <Text tone="secondary">{c.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dots} accessibilityRole="tablist">
        {purposeCards.map((c, i) => (
          <View
            key={c.headline}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            style={[
              styles.dot,
              { backgroundColor: i === index ? colors.textSecondary : colors.borderStrong },
            ]}
          />
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          title={last ? 'Continue' : 'Next'}
          onPress={() => (last ? onDone() : goTo(index + 1))}
        />
        {last ? null : <Button title="Skip" variant="ghost" onPress={onDone} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 24, minHeight: 240, justifyContent: 'center' },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
