import type { ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, LogoMark } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Branded fallback for route error boundaries: never a white screen. */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }]}
    >
      <LogoMark size={72} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Something went wrong
      </Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Smiley hit an unexpected problem. Your data is safe. Try again.
      </Text>
      {__DEV__ ? <Text style={[styles.dev, { color: colors.danger }]}>{error.message}</Text> : null}
      <View style={styles.actions}>
        <Button title="Try again" onPress={() => void retry()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
  dev: { fontSize: 12, textAlign: 'center', maxWidth: 480 },
  actions: { width: '100%', maxWidth: 320 },
});
