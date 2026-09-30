import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { brand, tintFor, useTheme } from '@/lib/theme';

import { Text } from './Text';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Pixel diameter per named size. A number is also accepted for one-offs. */
export const AVATAR_SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 64, xl: 96 };

type Props = {
  username: string;
  displayName?: string | null;
  uri?: string | null;
  size?: AvatarSize | number;
  /** Ring in the live color while this person is live (static; never animated). */
  live?: boolean;
};

function initialsOf(username: string, displayName?: string | null): string {
  const source = (displayName?.trim() || username).replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? '?').slice(0, 2).toUpperCase();
}

/** Image if the avatar exists, otherwise initials on a rainbow tint hashed from the username. */
export function Avatar({ username, displayName, uri, size = 'md', live }: Props) {
  const { colors } = useTheme();
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  const ring = live ? Math.max(2, Math.round(px / 20)) : 0;
  const gap = live ? Math.max(2, Math.round(px / 24)) : 0;
  const inner = px - (ring + gap) * 2;
  const box = { width: inner, height: inner, borderRadius: inner / 2 };

  const face = uri ? (
    <Image
      source={{ uri }}
      style={[box, { backgroundColor: colors.surface2 }]}
      accessibilityLabel={`${displayName || username} avatar`}
    />
  ) : (
    <View
      style={[styles.fallback, box, { backgroundColor: tintFor(username) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        variant="callout"
        weight="800"
        style={{ fontSize: inner * 0.4, lineHeight: inner * 0.5, color: brand.onRainbow }}
      >
        {initialsOf(username, displayName)}
      </Text>
    </View>
  );

  if (!live) return face;
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        borderWidth: ring,
        borderColor: colors.live,
        padding: gap,
      }}
    >
      {face}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
