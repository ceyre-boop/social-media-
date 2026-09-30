/**
 * Mode C (Stage): a bounded center region (docs/gift-render-spec.md). The subject stays inside
 * the stage box and fills 45/60/75/90% of it by value. Particles, rings and light may bleed up
 * to 12% beyond the box: the whole effect is clipped to the bleed box, and anything over a
 * guard zone is capped at 40% alpha. Chat stays legible: nothing here is opaque in a guard.
 */
import { View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Text } from '@/components/ui';
import { brand, giftTier, useTheme } from '@/lib/theme';

import { tierAccent } from './catalog';
import type { Gift } from './catalog';
import { GiftIcon } from './GiftIcon';
import { Falling, FxLabel, Particle, pick, rnd, useTimeline } from './fx';
import type { GiftStage } from './stageLayout';
import { GUARD } from './stageLayout';

type Props = {
  gift: Gift;
  senderName: string;
  stage: GiftStage;
  /** 1 full, 0.5 calm. */
  scale: number;
  /** Confetti and falling light. Off in Calm. */
  particles: boolean;
  /** OS reduced motion: a static card that only fades. */
  fadeOnly: boolean;
  /** Fill override (a Takeover shown as a Stage in Calm uses 90). */
  fillPct?: number;
  durationMs: number;
  onDone: () => void;
};

const CONFETTI = 22;
const STREAKS = 34;

export function StageGift({
  gift,
  senderName,
  stage,
  scale,
  particles,
  fadeOnly,
  fillPct,
  durationMs,
  onDone,
}: Props) {
  const { stage: s } = useTheme();
  const { p } = useTimeline(durationMs, onDone);
  const pop = useSharedValue(fadeOnly ? 1 : 0);
  useEffect(() => {
    if (!fadeOnly) pop.set(withSpring(1, { damping: 8, stiffness: 170, mass: 1 }));
  }, [pop, fadeOnly]);

  const { stageBox: box, bleedBox: bleed } = stage;
  const fill = (fillPct ?? gift.boxFillPct ?? 60) / 100;
  const subject = Math.min(box.w, box.h) * fill * scale;
  const iconSize = subject * 0.6;
  // Everything is positioned relative to the bleed box, which also clips it.
  const cx = box.x + box.w / 2 - bleed.x;
  const cy = box.y + box.h / 2 - bleed.y;
  const guard = {
    originY: bleed.y + cy,
    top: stage.topGuard.h,
    bottom: stage.bottomGuard.y,
    cap: GUARD.guardAlpha,
  };
  const range = giftTier[gift.tier].range;
  const shower = gift.tier === 'showers';

  const envelope = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.1, 0.88, 1], [0, 1, 1, 0]),
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.4 + pop.get() * 0.6 }] }));
  const ring = (from: number, to: number) => ({
    opacity: interpolate(p.get(), [from, from + 0.04, to], [0, 0.8, 0], 'clamp'),
    transform: [{ scale: interpolate(p.get(), [from, to], [0.5, 1.5], 'clamp') }],
  });
  const ring1 = useAnimatedStyle(() => ring(0, 0.45));
  const ring2 = useAnimatedStyle(() => ring(0.14, 0.6));
  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.25, 0.8, 1], [0, 0.11, 0.11, 0]),
  }));

  // Confetti endpoints sit on an ellipse that stays inside the bleed box.
  const rx = bleed.w / 2 - 14;
  const ry = bleed.h / 2 - 14;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <View
        style={{
          position: 'absolute',
          left: bleed.x,
          top: bleed.y,
          width: bleed.w,
          height: bleed.h,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, envelope]}
        >
          {/* Soft light behind the subject (bleed): stacked translucent discs read as a glow. */}
          {[1.5, 1.28, 1.08].map((k) => (
            <Animated.View
              key={k}
              style={[
                {
                  position: 'absolute',
                  left: cx - (subject * k) / 2,
                  top: cy - (subject * k) / 2,
                  width: subject * k,
                  height: subject * k,
                  borderRadius: subject,
                  backgroundColor: tierAccent(gift.tier),
                },
                glow,
              ]}
            />
          ))}
          {fadeOnly ? null : (
            <>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: cx - subject / 2,
                    top: cy - subject / 2,
                    width: subject,
                    height: subject,
                    borderRadius: subject,
                    borderWidth: 4,
                    borderColor: brand.sun,
                  },
                  ring1,
                ]}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: cx - subject / 2,
                    top: cy - subject / 2,
                    width: subject,
                    height: subject,
                    borderRadius: subject,
                    borderWidth: 4,
                    borderColor: tierAccent(gift.tier),
                  },
                  ring2,
                ]}
              />
            </>
          )}

          {particles && !fadeOnly && !shower ? (
            <View style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0 }}>
              {Array.from({ length: CONFETTI }, (_, i) => {
                const a = (i / CONFETTI) * Math.PI * 2 + rnd(i, 1) * 0.3;
                const k = 0.62 + rnd(i, 2) * 0.38;
                return (
                  <Particle
                    key={i}
                    p={p}
                    dx={Math.cos(a) * rx * k}
                    dy={Math.sin(a) * ry * k}
                    size={8 + rnd(i, 3) * 8}
                    color={pick(range, i)}
                    rotate={(rnd(i, 4) - 0.5) * 720}
                    start={0.05 + rnd(i, 5) * 0.06}
                    end={0.95}
                    round={i % 3 === 0}
                    guard={guard}
                  />
                );
              })}
            </View>
          ) : null}

          {particles && !fadeOnly && shower
            ? Array.from({ length: STREAKS }, (_, i) => (
                <Falling
                  key={i}
                  p={p}
                  x={rnd(i, 1) * (bleed.w - 8)}
                  h={bleed.h}
                  w={i % 4 === 0 ? 6 : 4}
                  len={i % 4 === 0 ? 30 : 50}
                  color={pick(range, i + Math.floor(rnd(i, 9) * 5))}
                  start={0.04 + rnd(i, 2) * 0.45}
                  end={0.45 + rnd(i, 2) * 0.5}
                  drift={5 + rnd(i, 3) * 10}
                  guard={{ ...guard, originY: bleed.y }}
                />
              ))
            : null}

          <View
            style={{
              position: 'absolute',
              left: cx - subject / 2,
              top: cy - subject / 2 - 22,
              width: subject,
              height: subject,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View style={iconStyle}>
              <GiftIcon gift={gift} size={iconSize} />
            </Animated.View>
          </View>
          <View
            style={{
              position: 'absolute',
              left: box.x - bleed.x,
              width: box.w,
              top: cy + subject / 2 - 14,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <FxLabel variant={subject > 200 ? 'display' : 'headline'}>{gift.name}</FxLabel>
            <Text
              variant="caption"
              tone="onMediaMuted"
              align="center"
              style={{ color: s.textSecondary }}
            >
              {`from ${senderName}`}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
