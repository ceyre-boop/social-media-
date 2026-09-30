import type { ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/config/brand';
import { Button, LogoMark, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Branded fallback for route error boundaries: never a white screen. */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.bg, padding: spacing.xxl, gap: spacing.lg }]}
    >
      <LogoMark size={72} />
      <Text accessibilityRole="header" variant="title" align="center">
        Something went wrong
      </Text>
      <Text tone="secondary" align="center" style={styles.body}>
        {brand.appName} hit an unexpected problem. Your data is safe. Try again.
      </Text>
      {__DEV__ ? (
        <Text variant="caption" tone="danger" align="center" style={styles.dev}>
          {error.message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button title="Try again" onPress={() => void retry()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { maxWidth: 360 },
  dev: { maxWidth: 480 },
  actions: { width: '100%', maxWidth: 320 },
});
