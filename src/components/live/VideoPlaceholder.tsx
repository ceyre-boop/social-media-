import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { AnchorFeed } from '@/components/gifts/anchor/useAnchorFeed';
import { Text } from '@/components/ui';
import { easings } from '@/lib/motion';
import type { LiveStream } from '@/lib/live/stub';
import { useReducedMotion, useTheme } from '@/lib/theme';

import { CreatorSilhouette } from './CreatorSilhouette';

/** Cross-fade period of the placeholder surface (slow: 9s each way). Stands in for video. */
const DRIFT_MS = 9000;

/**
 * Placeholder video surface: a slow drifting gradient in the stream's two brand colors, a
 * placeholder creator (host avatar as the head) and "Stream preview". Static under reduced
 * motion. No video, no network.
 */
export function VideoPlaceholder({ stream, feed }: { stream: LiveStream; feed: AnchorFeed }) {
  const { brand, stage, spacing, radius } = useTheme();
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  const [a, b] = stream.gradient;
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (reduce) {
      cancelAnimation(t);
      t.set(0);
      return;
    }
    t.set(withRepeat(withTiming(1, { duration: DRIFT_MS, easing: easings.standard }), -1, true));
    return () => cancelAnimation(t);
  }, [reduce, t]);

  const top = useAnimatedStyle(() => ({ opacity: t.get() }));
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View onLayout={onLayout} style={[StyleSheet.absoluteFill, { backgroundColor: stage.bg }]}>
      <LinearGradient
        colors={[brand[a], brand[b]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, top]}>
        <LinearGradient
          colors={[brand[b], brand[a]]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient
        colors={[stage.scrimTop, stage.scrimClear, stage.scrimClear, stage.scrimBottom]}
        locations={[0, 0.25, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {size.w > 0 ? (
        <CreatorSilhouette host={stream.host} feed={feed} w={size.w} h={size.h} />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size.h * 0.125,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radius.pill,
            backgroundColor: stage.control,
          }}
        >
          <Text variant="caption" tone="onMedia">
            {"Stream preview · video isn't connected yet"}
          </Text>
        </View>
      </View>
    </View>
  );
}
