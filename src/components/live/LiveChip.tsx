import { View } from 'react-native';

import { LiveDot, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Warm LIVE tag: breathing dot plus micro label, on the stage glass. Never red. */
export function LiveChip() {
  const { stage, spacing, radius } = useTheme();
  return (
    <View
      accessibilityLabel="Live"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs + 2,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs + 1,
        borderRadius: radius.pill,
        backgroundColor: stage.control,
        borderWidth: 1,
        borderColor: stage.border,
      }}
    >
      <LiveDot size={7} />
      <Text variant="micro" tone="onMedia">
        Live
      </Text>
    </View>
  );
}
