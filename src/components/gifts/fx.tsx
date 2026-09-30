/** Shared animation building blocks for gift render modes (Reanimated). */
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/**
 * Runs progress 0 to 1 over `duration`, then calls `onDone` once. It ignores the OS
 * reduced-motion shortcut on purpose: reduced motion is handled by each mode (fade-only, no
 * translate or scale), and the timeline itself must keep running so the gift still ends.
 */
export function useTimeline(duration: number, onDone: () => void) {
  const p = useSharedValue(0);
  const finished = useRef(false);
  const complete = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);
  useEffect(() => {
    p.set(
      withTiming(1, { duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (ok) => {
        if (ok !== false) scheduleOnRN(complete);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { p, complete };
}

/** Deterministic pseudo-random in [0, 1) so particle layouts are stable per index. */
export function rnd(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length];
}

/** Alpha cap for particles that bleed into a guard zone (spec: at most 40% alpha there). */
export type Guard = { originY: number; top: number; bottom: number; cap: number };

type ParticleProps = {
  p: SharedValue<number>;
  dx: number;
  dy: number;
  size: number;
  color: string;
  rotate?: number;
  start: number;
  end: number;
  round?: boolean;
  /** Vertical position of the particle's origin in the viewport, for the guard alpha cap. */
  guard?: Guard;
};

/** One piece flying out from the center of its parent to (dx, dy), easing out, then fading. */
export function Particle({
  p,
  dx,
  dy,
  size,
  color,
  rotate = 0,
  start,
  end,
  round,
  guard,
}: ParticleProps) {
  const style = useAnimatedStyle(() => {
    const q = Math.min(1, Math.max(0, (p.get() - start) / (end - start)));
    const e = 1 - (1 - q) * (1 - q) * (1 - q);
    const ty = dy * e;
    let alpha = q <= 0 ? 0 : interpolate(q, [0, 0.08, 0.7, 1], [0, 1, 1, 0]);
    if (guard) {
      const y = guard.originY + ty;
      if (y < guard.top || y > guard.bottom) alpha = Math.min(alpha, guard.cap);
    }
    return {
      opacity: alpha,
      transform: [{ translateX: dx * e }, { translateY: ty }, { rotate: `${rotate * q}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: round ? size : size * 0.55,
          borderRadius: round ? size / 2 : 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** A streak of light falling from the top of its (clipped) parent to the bottom. */
export function Falling({
  p,
  x,
  h,
  w,
  len,
  color,
  start,
  end,
  drift,
  guard,
}: {
  p: SharedValue<number>;
  x: number;
  h: number;
  w: number;
  len: number;
  color: string;
  start: number;
  end: number;
  drift: number;
  guard?: Guard;
}) {
  const style = useAnimatedStyle(() => {
    const q = Math.min(1, Math.max(0, (p.get() - start) / (end - start)));
    const ty = -len + (h + len * 2) * q;
    let alpha = q <= 0 || q >= 1 ? 0 : interpolate(q, [0, 0.1, 0.85, 1], [0, 1, 1, 0]);
    if (guard) {
      const y = guard.originY + ty + len / 2;
      if (y < guard.top || y > guard.bottom) alpha = Math.min(alpha, guard.cap);
    }
    return {
      opacity: alpha,
      transform: [{ translateX: drift * Math.sin(q * Math.PI * 2) }, { translateY: ty }],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: x, width: w, height: len, borderRadius: w / 2 },
        { backgroundColor: color },
        style,
      ]}
    />
  );
}

/** A four-point sparkle drawn as a rotated rounded square (no font or asset dependency). */
export function Sparkle({
  p,
  x,
  y,
  size,
  color,
  start,
}: {
  p: SharedValue<number>;
  x: number;
  y: number;
  size: number;
  color: string;
  start: number;
}) {
  const style = useAnimatedStyle(() => {
    const q = Math.min(1, Math.max(0, (p.get() - start) / 0.16));
    const pulse = Math.sin(q * Math.PI);
    return { opacity: pulse, transform: [{ rotate: '45deg' }, { scale: 0.3 + pulse * 0.9 }] };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Text that stays legible over any animated backdrop. */
export function FxLabel({
  children,
  variant = 'headline',
  tone = 'onMedia',
}: {
  children: ReactNode;
  variant?: 'headline' | 'display' | 'caption' | 'callout';
  tone?: 'onMedia' | 'onMediaMuted';
}) {
  const { stage } = useTheme();
  return (
    <Text
      variant={variant}
      tone={tone}
      align="center"
      style={{
        textShadowColor: stage.textShadow,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 8,
      }}
    >
      {children}
    </Text>
  );
}
