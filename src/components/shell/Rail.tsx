import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { RAIL_WIDTH } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

const POINTS = [
  { icon: 'heart-outline', text: 'Home shows only people you actually return to.' },
  { icon: 'eye-off-outline', text: 'No follower counts. Anywhere.' },
  { icon: 'information-circle-outline', text: 'If your reach is ever limited, we tell you why.' },
] as const;

/** Static right rail (wide only). */
export function Rail() {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={[styles.rail, { padding: spacing.lg }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
          },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          How Smiley works
        </Text>
        {POINTS.map((p) => (
          <View key={p.icon} style={styles.row}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
            <Text style={[styles.text, { color: colors.muted }]}>{p.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: RAIL_WIDTH, maxWidth: RAIL_WIDTH },
  card: { borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
});
