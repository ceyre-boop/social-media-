import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/config/brand';
import { Card, Text } from '@/components/ui';
import { RAIL_WIDTH } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

const POINTS = [
  { icon: 'heart-outline', text: 'Home shows the people you keep coming back to.' },
  { icon: 'compass-outline', text: 'Discover is a small, finite room. Visit it, then leave.' },
  { icon: 'eye-off-outline', text: 'No follower counts. Anywhere.' },
  { icon: 'information-circle-outline', text: 'If your reach is ever limited, we tell you why.' },
] as const;

/** Static right rail (wide only). */
export function Rail() {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.rail, { padding: spacing.lg }]}>
      <Card elevation={1} style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" variant="headline">
          How {brand.appName} works
        </Text>
        {POINTS.map((p) => (
          <View key={p.icon} style={[styles.row, { gap: spacing.md }]}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
            <Text variant="caption" tone="secondary" style={styles.text}>
              {p.text}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: RAIL_WIDTH, maxWidth: RAIL_WIDTH },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1, lineHeight: 19 },
});
