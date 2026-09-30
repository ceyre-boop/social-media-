/**
 * Mode D (Takeover): Sunrise (10,000 blips). 6s, covers everything except the top 10% and
 * bottom 12% of the viewport. The sender's name and avatar are foregrounded: this is the one
 * place the sender matters more than the gift. Tap to dismiss early. Sky and ground fade at
 * the rect edges so the guards stay clean. "The Whole Sky" washes every color across instead
 * of a sun.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Avatar, Text } from '@/components/ui';
import { brand, giftCream, giftInk, giftTier, useTheme } from '@/lib/theme';

import type { Gift } from './catalog';
import { FxLabel, Sparkle, pick, rnd, useTimeline } from './fx';
import type { GiftSender } from './rail';
import type { GiftStage } from './stageLayout';

type Props = {
  gift: Gift;
  sender: GiftSender;
  stage: GiftStage;
  fadeOnly: boolean;
  onDone: () => void;
};

const RAYS = 14;
const SPARKLES = 20;

export function TakeoverGift({ gift, sender, stage, fadeOnly, onDone }: Props) {
  const { stage: s } = useTheme();
  const { p, complete } = useTimeline(gift.durationMs, onDone);
  const closing = useSharedValue(0);
  const dismissed = useRef(false);
  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    closing.set(
      withTiming(1, { duration: 240 }, (ok) => {
        if (ok !== false) scheduleOnRN(complete);
      }),
    );
  };
  const wholeSky = gift.id === 'the-whole-sky';
  const range = giftTier.sunrise.range;

  const rect = stage.takeover;
  const w = rect.w;
  const h = rect.h;
  const horizon = h * 0.76;
  const S = Math.min(w, h) * 0.36;

  const envelope = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.1, 0.9, 1], [0, 1, 1, 0]) * (1 - closing.get()),
  }));
  const skyReveal = useAnimatedStyle(() => ({
    width: w * (fadeOnly ? 1 : interpolate(p.get(), [0.05, 0.5], [0, 1], 'clamp')),
  }));
  const sunGroup = useAnimatedStyle(() => {
    if (fadeOnly) return { transform: [{ translateY: 0 }] };
    const q = Math.min(1, Math.max(0, (p.get() - 0.06) / 0.5));
    const e = 1 - (1 - q) * (1 - q) * (1 - q);
    return { transform: [{ translateY: (1 - e) * S * 0.9 }] };
  });
  const rays = useAnimatedStyle(() => ({
    opacity: fadeOnly ? 0 : interpolate(p.get(), [0.42, 0.6, 0.9], [0, 0.9, 0.9], 'clamp'),
    transform: [
      { rotate: `${p.get() * 36}deg` },
      { scale: interpolate(p.get(), [0.42, 0.7], [0.8, 1], 'clamp') },
    ],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: fadeOnly ? 1 : interpolate(p.get(), [0.3, 0.6], [0, 1], 'clamp'),
  }));
  const label = useAnimatedStyle(() => ({
    opacity: fadeOnly ? 1 : interpolate(p.get(), [0.12, 0.3], [0, 1], 'clamp'),
    transform: [{ translateY: fadeOnly ? 0 : interpolate(p.get(), [0.12, 0.3], [12, 0], 'clamp') }],
  }));

  const skyColors = wholeSky
    ? ([
        s.scrimClear,
        brand.violet,
        brand.sky,
        brand.lime,
        brand.sun,
        brand.tangerine,
        brand.magenta,
        s.scrimClear,
      ] as const)
    : ([s.scrimClear, s.warmTop, brand.magenta, brand.tangerine, brand.sun, s.scrimClear] as const);

  return (
    <View
      style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss gift animation"
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, envelope]}
        >
          {wholeSky ? (
            <Animated.View
              style={[
                { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },
                skyReveal,
              ]}
            >
              <LinearGradient colors={skyColors} style={{ width: w, height: h }} />
            </Animated.View>
          ) : (
            <LinearGradient colors={skyColors} style={StyleSheet.absoluteFill} />
          )}

          {wholeSky ? null : (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: (w - S) / 2,
                  top: horizon - S * 0.62,
                  width: S,
                  height: S,
                },
                sunGroup,
              ]}
            >
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { alignItems: 'center', justifyContent: 'center' },
                  glow,
                ]}
              >
                <View
                  style={{
                    position: 'absolute',
                    width: S * 1.9,
                    height: S * 1.9,
                    borderRadius: S,
                    backgroundColor: brand.tangerine,
                    opacity: 0.22,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    width: S * 1.4,
                    height: S * 1.4,
                    borderRadius: S,
                    backgroundColor: brand.sun,
                    opacity: 0.3,
                  }}
                />
              </Animated.View>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { alignItems: 'center', justifyContent: 'center' },
                  rays,
                ]}
              >
                {Array.from({ length: RAYS }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      width: 7,
                      height: S * 0.26,
                      borderRadius: 4,
                      backgroundColor: brand.sun,
                      transform: [
                        { rotate: `${(360 / RAYS) * i}deg` },
                        { translateY: -(S / 2 + S * 0.2) },
                      ],
                    }}
                  />
                ))}
              </Animated.View>
              <View
                style={{ width: S, height: S, borderRadius: S / 2, backgroundColor: brand.sun }}
              />
            </Animated.View>
          )}

          {/* Ground silhouette; fades out at the bottom edge so the guard stays clean. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: horizon - 40, bottom: 0 }}>
            <View
              style={{
                position: 'absolute',
                left: -w * 0.25,
                top: 0,
                width: w * 1.2,
                height: 130,
                borderRadius: w,
                backgroundColor: giftInk,
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: -w * 0.3,
                top: 20,
                width: w * 1.1,
                height: 110,
                borderRadius: w,
                backgroundColor: giftInk,
              }}
            />
            <LinearGradient
              colors={[giftInk, giftInk, s.scrimClear]}
              locations={[0, 0.55, 1]}
              style={{ position: 'absolute', left: 0, right: 0, top: 60, bottom: 0 }}
            />
          </View>

          {fadeOnly
            ? null
            : Array.from({ length: SPARKLES }, (_, i) => (
                <Sparkle
                  key={i}
                  p={p}
                  x={w * (0.06 + rnd(i, 5) * 0.88)}
                  y={horizon * (0.1 + rnd(i, 6) * 0.8)}
                  size={8 + rnd(i, 7) * 14}
                  color={i % 4 === 3 ? giftCream : pick(range, i)}
                  start={0.35 + rnd(i, 8) * 0.5}
                />
              ))}

          {/* The sender is foregrounded. */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 16,
                right: 16,
                top: h * 0.05,
                alignItems: 'center',
                gap: 8,
              },
              label,
            ]}
          >
            <Avatar username={sender.username} displayName={sender.name} size="xl" />
            <FxLabel variant="display">{sender.name}</FxLabel>
            <FxLabel variant="headline">{`sent ${gift.name}`}</FxLabel>
            <Text variant="caption" tone="onMediaMuted">
              Tap anywhere to close
            </Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
