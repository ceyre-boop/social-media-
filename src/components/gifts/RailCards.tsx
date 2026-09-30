/** Mode A (Rail): stacked cards on the right, above the bottom guard, with combo counters. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Avatar, Text } from '@/components/ui';
import { giftInk, giftTier, useTheme } from '@/lib/theme';

import { findGift, tierAccent } from './catalog';
import type { Gift } from './catalog';
import { GiftIcon } from './GiftIcon';
import { Particle, pick, rnd, useTimeline } from './fx';
import type { RailCard } from './rail';
import type { GiftStage } from './stageLayout';

type Props = {
  cards: RailCard[];
  stage: GiftStage;
  /** Particle puff on Sparks entry (full motion only). */
  particles: boolean;
  /** OS reduced motion: cards fade, nothing moves or scales. */
  fadeOnly: boolean;
};

export function RailCards({ cards, stage, particles, fadeOnly }: Props) {
  const { rail, size } = stage;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: stage.gutter,
        top: rail.y,
        height: rail.h - 8,
        maxWidth: size.w - stage.gutter * 2,
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      {cards.map((card) => {
        const gift = findGift(card.giftId);
        if (!gift) return null;
        return (
          <RailCardView
            key={card.id}
            card={card}
            gift={gift}
            maxWidth={size.w - stage.gutter * 2}
            particles={particles && card.puff}
            fadeOnly={fadeOnly}
          />
        );
      })}
    </View>
  );
}

function RailCardView({
  card,
  gift,
  maxWidth,
  particles,
  fadeOnly,
}: {
  card: RailCard;
  gift: Gift;
  maxWidth: number;
  particles: boolean;
  fadeOnly: boolean;
}) {
  const { stage, radius, spacing, motion } = useTheme();
  const full = card.full;
  const iconSize = full ? 72 : 48;
  return (
    <Animated.View
      entering={
        fadeOnly
          ? FadeIn.duration(motion.duration.quick)
          : FadeInDown.duration(motion.duration.base)
      }
      exiting={FadeOut.duration(motion.duration.base)}
      layout={fadeOnly ? undefined : LinearTransition.duration(motion.duration.base)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm + 2,
        maxWidth: Math.min(full ? 340 : 280, maxWidth),
        paddingVertical: spacing.sm,
        paddingLeft: spacing.sm,
        paddingRight: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: tierAccent(gift.tier),
        backgroundColor: stage.glass,
      }}
    >
      <View style={{ width: iconSize, height: iconSize }}>
        {particles ? <Puff accent={giftTier[gift.tier].range} size={iconSize} /> : null}
        <GiftIcon gift={gift} size={iconSize} />
      </View>
      <Avatar
        username={card.sender.username}
        displayName={card.sender.name}
        size={full ? 'sm' : 'xs'}
      />
      <View style={{ flexShrink: 1 }}>
        <Text variant={full ? 'callout' : 'caption'} tone="onMedia" weight="700" numberOfLines={1}>
          {card.sender.name}
        </Text>
        <Text variant={full ? 'body' : 'caption'} tone="onMediaMuted" numberOfLines={1}>
          {gift.name}
        </Text>
      </View>
      {card.count > 1 ? (
        <ComboBadge count={card.count} bump={card.bump} fadeOnly={fadeOnly} />
      ) : null}
    </Animated.View>
  );
}

/** "x3": grows a little with the streak and pulses on every hit. */
function ComboBadge({ count, bump, fadeOnly }: { count: number; bump: number; fadeOnly: boolean }) {
  const { radius, spacing } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (fadeOnly || bump === 0) return;
    pulse.set(
      withSequence(
        withTiming(1.45, { duration: 90 }),
        withSpring(1, { damping: 8, stiffness: 220, mass: 1 }),
      ),
    );
  }, [bump, fadeOnly, pulse]);
  const grow = fadeOnly ? 1 : 1 + Math.min(count, 20) * 0.02;
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() * grow }] }));
  return (
    <Animated.View
      accessibilityLabel={`${count} in a row`}
      style={[
        {
          minWidth: 36,
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: giftTier.sparks.accent,
        },
        style,
      ]}
    >
      <Text variant="callout" weight="800" style={{ color: giftInk }}>
        {`x${count}`}
      </Text>
    </Animated.View>
  );
}

/** Small particle puff around the icon on entry (Sparks). */
function Puff({ accent, size }: { accent: readonly string[]; size: number }) {
  const { p } = useTimeline(700, () => undefined);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
    >
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + rnd(i, 1) * 0.5;
        const d = size * (0.7 + rnd(i, 2) * 0.35);
        return (
          <Particle
            key={i}
            p={p}
            dx={Math.cos(a) * d}
            dy={Math.sin(a) * d}
            size={4 + rnd(i, 3) * 4}
            color={pick(accent, i)}
            start={0.02}
            end={0.95}
            round
          />
        );
      })}
    </View>
  );
}
