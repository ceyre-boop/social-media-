import { Ionicons } from '@expo/vector-icons';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

import { NAV_ICON_SIZE } from './CreateGlyph';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = TabTriggerSlotProps & {
  label: string;
  /** An Ionicons outline name, or a custom glyph (same 24px box) for Create. */
  icon: IconName | ((color: string) => React.ReactNode);
  active: boolean;
  /** Layout: sidebar expanded (row + label), sidebar collapsed (icon only). */
  mode: 'side' | 'side-collapsed';
};

/**
 * A tab trigger rendered as a sidebar row. One icon size, one label style, one neutral color;
 * active changes the color only (accent), never the glyph, weight, size or background.
 */
export function NavItem({ label, icon, active, mode, isFocused: _f, ...props }: Props) {
  const { colors, radius, spacing } = useTheme();
  const color = active ? colors.primary : colors.textSecondary;
  const glyph =
    typeof icon === 'string' ? (
      <Ionicons name={icon} size={NAV_ICON_SIZE} color={color} />
    ) : (
      icon(color)
    );

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
            backgroundColor: hovered || state.pressed ? colors.surface2 : 'transparent',
          },
        ];
      }}
    >
      <View style={styles.sideIcon}>{glyph}</View>
      {mode === 'side' ? (
        <Text variant="callout" weight="600" style={{ fontSize: 16, color }}>
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
  sideIcon: { width: NAV_ICON_SIZE, alignItems: 'center' },
});
