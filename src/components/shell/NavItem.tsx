import { Ionicons } from '@expo/vector-icons';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = TabTriggerSlotProps & {
  label: string;
  icon: IconName;
  activeIcon: IconName;
  active: boolean;
  /** Layout: sidebar expanded (row + label), sidebar collapsed (icon only). */
  mode: 'side' | 'side-collapsed';
};

/** A tab trigger rendered as a sidebar row. Forwards trigger props to Pressable. */
export function NavItem({ label, icon, activeIcon, active, mode, isFocused: _f, ...props }: Props) {
  const { colors, radius, spacing } = useTheme();
  const color = active ? colors.primary : colors.textSecondary;
  const glyph = <Ionicons name={active ? activeIcon : icon} size={26} color={color} />;

  return (
    <Pressable
      {...props}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.sideItem,
          mode === 'side-collapsed' && styles.sideItemCollapsed,
          {
            gap: spacing.lg,
            paddingHorizontal: mode === 'side-collapsed' ? 0 : spacing.md,
            borderRadius: radius.pill,
            backgroundColor: active
              ? colors.primarySubtle
              : hovered || state.pressed
                ? colors.surface2
                : 'transparent',
          },
        ];
      }}
    >
      <View style={styles.sideIcon}>{glyph}</View>
      {mode === 'side' ? (
        <Text
          variant="headline"
          style={{ fontSize: 17, color: active ? colors.primary : colors.text }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sideItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'pointer',
  },
  sideItemCollapsed: { width: 48, justifyContent: 'center' },
  sideIcon: { width: 26, alignItems: 'center' },
});
