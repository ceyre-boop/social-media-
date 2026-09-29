import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Button } from './Button';
import { LogoMark } from './Logo';

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Show the logo badge above the text. */
  logo?: boolean;
};

export function EmptyState({ title, message, actionLabel, onAction, logo = true }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.wrap, { padding: spacing.xxl, gap: spacing.lg }]}>
      {logo ? <LogoMark size={72} /> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.muted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
});
