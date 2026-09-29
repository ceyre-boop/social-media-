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
  style?: StyleProp<ViewStyle>;
};

/** Icon-only button with a 44px hit target. `label` is required for accessibility. */
export function IconButton({ icon, label, onPress, color, size = 24, disabled, style }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.base,
          {
            backgroundColor: state.pressed || hovered ? colors.surface2 : 'transparent',
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ];
      }}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.text} />
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
