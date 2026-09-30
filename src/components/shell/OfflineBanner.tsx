import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useOnline } from '@/lib/network';
import { useTheme } from '@/lib/theme';

/** Slim banner shown while requests are failing / the browser reports offline. */
export function OfflineBanner({ floating }: { floating?: boolean }) {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius, elevation } = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface2,
          borderBottomColor: colors.border,
          gap: spacing.sm,
          paddingVertical: spacing.sm - 2,
          paddingHorizontal: spacing.md,
        },
        floating && [
          styles.floating,
          elevation[2],
          { top: insets.top + 60, borderRadius: radius.pill, paddingHorizontal: spacing.lg },
        ],
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
      <Text variant="caption" weight="600">
        You&apos;re offline. We&apos;ll reconnect automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 30,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
