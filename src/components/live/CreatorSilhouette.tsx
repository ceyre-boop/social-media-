import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { GIFT_DEBUG } from '@/components/gifts/GiftDebugOverlay';
import type { AnchorFeed } from '@/components/gifts/anchor/useAnchorFeed';
import { ANCHOR_NAMES } from '@/components/gifts/anchor/types';
import { Avatar } from '@/components/ui';
import { stubAnchorSampleAt, stubBodyAt } from '@/lib/live/stub';
import type { LiveHost } from '@/lib/live/stub';
import { brand, useTheme } from '@/lib/theme';

/**
 * Placeholder creator on the preview surface, so anchored gifts visibly land on someone. It is
 * drawn where the creator was in the frame on screen (PTS = now minus the simulated video
 * delay), the same clock the anchor engine matches against. The gentle sway stands in for
 * live video and holds still under reduced motion.
 */
export function CreatorSilhouette({
  host,
  feed,
  w,
  h,
}: {
  host: LiveHost;
  feed: AnchorFeed;
  w: number;
  h: number;
}) {
  const { stage } = useTheme();
  const cx = useSharedValue(0.5);
  const cy = useSharedValue(0.44);
  const s = useSharedValue(1);

  useEffect(() => {
    const apply = () => {
      const b = stubBodyAt(feed.displayedPts(), feed.sway);
      cx.set(b.cx);
      cy.set(b.cy);
      s.set(b.s);
    };
    apply();
    if (feed.sway === 0) return;
    let raf = 0;
    const tick = () => {
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [feed, cx, cy, s]);

  const group = useAnimatedStyle(() => ({
    transform: [{ translateX: cx.get() * w }, { translateY: cy.get() * h }, { scale: s.get() }],
  }));

  const head = Math.max(48, Math.min(96, w * 0.2));
  const shoulderY = -0.06 * h;
  const bodyW = Math.min(w * 0.44, 210);
  const dots = GIFT_DEBUG ? stubAnchorSampleAt(0, 0) : null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}
    >
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, group]}
      >
        <View
          style={{
            position: 'absolute',
            left: -bodyW / 2,
            top: shoulderY - head * 0.32,
            width: bodyW,
            height: h * 0.36,
            borderTopLeftRadius: bodyW * 0.5,
            borderTopRightRadius: bodyW * 0.5,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
            backgroundColor: stage.glassActive,
            borderWidth: 1,
            borderColor: stage.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: -head / 2,
            top: -0.12 * h - head / 2,
            width: head,
            height: head,
            borderRadius: head / 2,
            overflow: 'hidden',
          }}
        >
          <Avatar username={host.username} displayName={host.displayName} size={head} />
        </View>
        {dots
          ? ANCHOR_NAMES.map((name) => {
              const p = dots[name];
              if (!p) return null;
              const b = stubBodyAt(0, 0);
              return (
                <View
                  key={name}
                  style={{
                    position: 'absolute',
                    left: ((p.x - b.cx) / b.s) * w - 4,
                    top: ((p.y - b.cy) / b.s) * h - 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: brand.lime,
                  }}
                />
              );
            })
          : null}
      </Animated.View>
    </View>
  );
}
