import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '@/lib/network';
import { useTheme } from '@/lib/theme';

/** Slim banner shown while requests are failing / the browser reports offline. */
export function OfflineBanner({ floating }: { floating?: boolean }) {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        { backgroundColor: colors.surface2, borderBottomColor: colors.border },
        floating && [styles.floating, { top: insets.top + 60 }],
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
      <Text style={[styles.text, { color: colors.text }]}>
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 13, fontWeight: '600' },
});
