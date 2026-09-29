import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

import { Brand } from './Logo';

type Props = {
  title: string;
  /** Compact only: show logo + wordmark instead of the title (Feed). */
  brand?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

/** Top bar. Pads for the status bar on compact; hairline header on desktop. */
export function AppBar({ title, brand, left, right }: Props) {
  const { colors, spacing } = useTheme();
  const compact = useBreakpoint() === 'compact';
  const insets = useSafeAreaInsets();
  const top = compact ? insets.top : 0;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: top,
          height: 56 + top,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {left ? <View style={{ marginLeft: -spacing.sm }}>{left}</View> : null}
      <View style={styles.title}>
        {brand && compact ? (
          <Brand size={32} />
        ) : (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.text, { color: colors.text }]}
          >
            {title}
          </Text>
        )}
      </View>
      {right ? <View style={{ marginRight: -spacing.sm }}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, justifyContent: 'center' },
  text: { fontSize: 20, fontWeight: '800' },
});
