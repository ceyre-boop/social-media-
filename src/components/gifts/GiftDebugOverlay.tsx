/**
 * Dev-only: outlines the safe areas (EXPO_PUBLIC_GIFT_DEBUG=1). Guards, gutters, stage box,
 * bleed box and the takeover rect, drawn from the same `useGiftStage()` rects the gifts use.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { brand } from '@/lib/theme';

import type { GiftStage, Rect } from './stageLayout';

export const GIFT_DEBUG = process.env.EXPO_PUBLIC_GIFT_DEBUG === '1';

function Box({
  rect,
  color,
  label,
  fill,
}: {
  rect: Rect;
  color: string;
  label: string;
  fill?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderWidth: 2,
        borderColor: color,
        borderStyle: fill ? 'solid' : 'dashed',
      }}
    >
      {fill ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color,
            opacity: 0.12,
          }}
        />
      ) : null}
      <Text variant="micro" style={{ color, backgroundColor: 'transparent' }}>
        {label}
      </Text>
    </View>
  );
}

export function GiftDebugOverlay({ stage }: { stage: GiftStage }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <Box rect={stage.topGuard} color={brand.magenta} label="top guard 0-14%" fill />
      <Box rect={stage.bottomGuard} color={brand.magenta} label="bottom guard 72-100%" fill />
      <Box rect={stage.takeover} color={brand.sun} label="takeover 10%-88%" />
      <Box rect={stage.bleedBox} color={brand.sky} label="bleed box (+12%)" />
      <Box rect={stage.stageBox} color={brand.lime} label="stage box 18-68%" />
      <Box rect={stage.rail} color={brand.violet} label="rail (max 4)" />
    </View>
  );
}
