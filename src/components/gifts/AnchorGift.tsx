/**
 * Mode B (Anchor): the gift follows the creator's body. Placement comes from the pure engine in
 * ./anchor: samples are matched to the PTS of the frame on screen (not the latest sample) and
 * interpolated. No usable anchor at the start: degrade to the rail (onDegrade). Tracking lost
 * mid-animation: hold 400ms, then ease to the stage center, never jump.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

import { AnchorTracker } from './anchor/engine';
import type { AnchorName } from './anchor/engine';
import type { AnchorFeed } from './anchor/useAnchorFeed';
import type { Gift } from './catalog';
import { GiftIcon } from './GiftIcon';
import { useTimeline } from './fx';
import type { GiftStage } from './stageLayout';

/** Sprite size at scale 1 (before the anchor's `s` and the viewer's motion scale). */
const BASE = 84;

/** Where the sprite sits relative to its anchor. A crown sits on its base; the rest center. */
const REGISTRATION: Record<AnchorName, { x: number; y: number }> = {
  crown: { x: 0.5, y: 1 },
  face: { x: 0.5, y: 0.5 },
  chest: { x: 0.5, y: 0.5 },
  hands: { x: 0.5, y: 0.5 },
  shoulder_l: { x: 0.5, y: 0.5 },
  shoulder_r: { x: 0.5, y: 0.5 },
};

type Props = {
  gift: Gift;
  senderName: string;
  stage: GiftStage;
  feed: AnchorFeed;
  /** 1 full, 0.5 calm. */
  scale: number;
  /** OS reduced motion: opacity only. */
  fadeOnly: boolean;
  onDone: () => void;
  /** No anchor available: the caller renders this gift as a full-size Glow rail card. */
  onDegrade: () => void;
};

export function AnchorGift({
  gift,
  senderName,
  stage,
  feed,
  scale,
  fadeOnly,
  onDone,
  onDegrade,
}: Props) {
  const { stage: st, radius, spacing } = useTheme();
  const { p } = useTimeline(gift.durationMs, onDone);
  const { w, h } = stage.size;

  // Decided once, on the first render: is there any anchor to follow right now?
  const [init] = useState(() => {
    const tracker = new AnchorTracker({
      preferred: gift.anchorPreferred ?? 'chest',
      fallbacks: gift.anchorFallbacks,
      center: { x: 0.5, y: (stage.stageBox.y + stage.stageBox.h / 2) / h },
    });
    return { tracker, first: tracker.start(feed.buffer, feed.displayedPts()) };
  });
  const { tracker, first } = init;
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  const anchor = gift.anchorPreferred ?? 'chest';
  const size = BASE * scale;

  useEffect(() => {
    if (!first) {
      onDegrade();
      return;
    }
    x.set(first.x * w);
    y.set(first.y * h);
    s.set(first.s);
    let raf = 0;
    const tick = () => {
      const out = tracker.update(feed.buffer, feed.displayedPts(), Date.now());
      x.set(out.x * w);
      y.set(out.y * h);
      s.set(out.s);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The tracker decides once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reg = REGISTRATION[anchor];
  const style = useAnimatedStyle(() => {
    const k = s.get() * (fadeOnly ? 1 : interpolate(p.get(), [0, 0.15], [0.6, 1], 'clamp'));
    const bob = fadeOnly ? 0 : Math.sin(p.get() * Math.PI * 3) * 5;
    return {
      opacity: interpolate(p.get(), [0, 0.12, 0.82, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: x.get() - size * reg.x },
        { translateY: y.get() - size * reg.y + bob },
        { scale: k },
      ],
    };
  });

  if (!first) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, width: size, alignItems: 'center' },
          style,
        ]}
      >
        <GiftIcon gift={gift} size={size} />
        <View
          style={{
            marginTop: spacing.xs,
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
            borderRadius: radius.pill,
            backgroundColor: st.glass,
          }}
        >
          <Text variant="caption" tone="onMedia" numberOfLines={1} style={{ width: undefined }}>
            {`${senderName} · ${gift.name}`}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
