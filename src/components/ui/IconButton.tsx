import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  /** Sits over media: uses the fixed stage colors and a translucent disc. */
  onMedia?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Icon-only button with a 44px hit target. `label` is required for accessibility. */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 24,
  disabled,
  onMedia,
  style,
}: Props) {
  const { colors, stage } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        const active = state.pressed || hovered;
        return [
          styles.base,
          {
            backgroundColor: onMedia
              ? active
                ? stage.controlHover
                : stage.control
              : active
                ? colors.surface2
                : 'transparent',
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ];
      }}
    >
      <Ionicons name={icon} size={size} color={color ?? (onMedia ? stage.text : colors.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
});
