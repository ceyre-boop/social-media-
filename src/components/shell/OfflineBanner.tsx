import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useOnline } from '@/lib/network';
import { useTheme } from '@/lib/theme';

/** Slim banner shown while requests are failing / the browser reports offline. */
export function OfflineBanner() {
  const online = useOnline();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
      <Text style={[styles.text, { color: colors.text }]}>
        You&apos;re offline. We&apos;ll reconnect automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
