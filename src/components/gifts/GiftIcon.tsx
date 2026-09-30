import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { giftInk } from '@/lib/theme';

import { tierAccent } from './catalog';
import type { Gift } from './catalog';

/**
 * A gift's icon on a rounded tile in its tier accent. Gifts with illustrations show the art
 * over a soft accent tile with an accent edge (so it reads on bright and dark backgrounds);
 * the five slots without art yet show one Ionicons glyph on a solid accent tile.
 */
export function GiftIcon({ gift, size = 64 }: { gift: Gift; size?: number }) {
  const accent = tierAccent(gift.tier);
  const radius = size * 0.3;
  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (gift.art) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={box}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
            backgroundColor: accent,
            opacity: 0.3,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
            borderWidth: Math.max(1.5, size / 36),
            borderColor: accent,
          }}
        />
        <Image
          source={gift.art}
          style={{ width: size * 0.84, height: size * 0.84 }}
          contentFit="contain"
        />
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[box, { backgroundColor: accent }]}
    >
      <Ionicons name={gift.glyph ?? 'gift'} size={Math.round(size * 0.5)} color={giftInk} />
    </View>
  );
}
