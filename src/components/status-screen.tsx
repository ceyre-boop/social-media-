import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { LogoMark, PageTitle } from '@/components/ui';
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
      style={[styles.wrap, { backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }]}
    >
      <PageTitle title={title} />
      <LogoMark size={72} />
      {spinner ? <ActivityIndicator color={colors.primary} /> : null}
      {spinner ? null : (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
      )}
      {message ? <Text style={[styles.body, { color: colors.muted }]}>{message}</Text> : null}
      {detail ? <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 380 },
  detail: { fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 420 },
  actions: { width: '100%', maxWidth: 320, gap: 12 },
});
