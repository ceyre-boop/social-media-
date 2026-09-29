import { Ionicons } from '@expo/vector-icons';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  const { colors, radius } = useTheme();
  const color = active ? colors.primary : colors.muted;
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
            borderRadius: radius.pill,
            backgroundColor: active
              ? colors.surface2
              : hovered || state.pressed
                ? colors.surface
                : 'transparent',
          },
        ];
      }}
    >
      <View style={styles.sideIcon}>{glyph}</View>
      {mode === 'side' ? (
        <Text style={[styles.sideLabel, { color: active ? colors.primary : colors.text }]}>
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
    gap: 16,
    paddingHorizontal: 12,
    cursor: 'pointer',
  },
  sideItemCollapsed: { width: 48, justifyContent: 'center', paddingHorizontal: 0 },
  sideIcon: { width: 26, alignItems: 'center' },
  sideLabel: { fontSize: 17, fontWeight: '700' },
});
