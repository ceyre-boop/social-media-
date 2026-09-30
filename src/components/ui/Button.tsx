import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };

/**
 * States: rest, hover (web), pressed, disabled (50%), loading (spinner, busy).
 * Focus-visible: the global :focus-visible ring in +html.tsx (theme focus color).
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
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
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        const active = state.pressed || hovered;
        const bg =
          variant === 'primary'
            ? active
              ? colors.primaryPressed
              : colors.primary
            : variant === 'ghost'
              ? active
                ? colors.surface2
                : 'transparent'
              : variant === 'danger'
                ? active
                  ? colors.surface2
                  : 'transparent'
                : active
                  ? colors.surface3
                  : colors.surface2;
        return [
          styles.base,
          {
            minHeight: HEIGHT[size],
            backgroundColor: bg,
            borderRadius: size === 'sm' ? radius.sm : radius.md,
            paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
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
        <View style={[styles.row, { gap: spacing.sm }]}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={fg} /> : null}
          <Text
            variant="callout"
            weight="700"
            style={{ color: fg, fontSize: size === 'lg' ? 16 : 15 }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
});
