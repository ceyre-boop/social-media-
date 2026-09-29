import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  const inactive = disabled || loading;

  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        const bg =
          variant === 'primary'
            ? state.pressed || hovered
              ? colors.primaryPressed
              : colors.primary
            : variant === 'ghost'
              ? state.pressed || hovered
                ? colors.surface2
                : 'transparent'
              : state.pressed || hovered
                ? colors.border
                : colors.surface2;
        return [
          styles.base,
          {
            backgroundColor: bg,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            opacity: inactive ? 0.5 : 1,
            borderWidth: variant === 'danger' ? 1 : 0,
            borderColor: colors.danger,
          },
          style,
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 16, fontWeight: '700' },
});
