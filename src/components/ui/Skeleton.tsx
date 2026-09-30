import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';

/** Static (non-shimmering) placeholder block: loading is calm, never urgent. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius: r } = useTheme();
  return (
    <View
      style={[
        { width, height, borderRadius: radius ?? r.sm, backgroundColor: colors.surface2 },
        style,
      ]}
    />
  );
}

export function PostCardSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      style={{ paddingVertical: spacing.lg, gap: spacing.md }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Skeleton width={40} height={40} radius={20} />
        <View style={{ gap: spacing.xs + 2 }}>
          <Skeleton width={120} height={12} />
          <Skeleton width={80} height={10} />
        </View>
      </View>
      <Skeleton height={undefined} radius={0} style={{ aspectRatio: 4 / 5 }} />
      <Skeleton width="70%" height={12} style={{ marginHorizontal: spacing.lg }} />
    </View>
  );
}
