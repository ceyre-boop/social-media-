import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { LogoMark, PageTitle, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Full-screen branded state: spinner, config problem, unreachable server, profile failure. */
export function StatusScreen({
  title,
  message,
  detail,
  spinner,
  children,
}: {
  title: string;
  message?: string;
  /** Developer-only hint; pass it only under __DEV__. */
  detail?: string;
  spinner?: boolean;
  children?: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.bg, padding: spacing.xxl, gap: spacing.lg }]}
    >
      <PageTitle title={title} />
      <LogoMark size={72} />
      {spinner ? <ActivityIndicator color={colors.primary} /> : null}
      {spinner ? null : (
        <Text accessibilityRole="header" variant="title" align="center">
          {title}
        </Text>
      )}
      {message ? (
        <Text tone="secondary" align="center" style={styles.body}>
          {message}
        </Text>
      ) : null}
      {detail ? (
        <Text variant="caption" tone="muted" align="center" style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { maxWidth: 380 },
  detail: { maxWidth: 420 },
  actions: { width: '100%', maxWidth: 320, gap: 12 },
});
