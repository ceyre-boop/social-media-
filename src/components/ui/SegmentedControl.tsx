import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Text } from './Text';

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.xs,
          gap: spacing.xs,
        },
      ]}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="radio"
            accessibilityLabel={s.label}
            accessibilityState={{ checked: active }}
            onPress={() => onChange(s.value)}
            style={(state) => {
              const hovered = (state as { hovered?: boolean }).hovered;
              return [
                styles.segment,
                {
                  borderRadius: radius.sm,
                  backgroundColor: active
                    ? colors.primary
                    : hovered || state.pressed
                      ? colors.surface2
                      : 'transparent',
                },
              ];
            }}
          >
            <Ionicons
              name={s.icon}
              size={18}
              color={active ? colors.onPrimary : colors.textSecondary}
            />
            <Text
              variant="caption"
              weight="700"
              numberOfLines={1}
              style={{ color: active ? colors.onPrimary : colors.text, flexShrink: 1 }}
            >
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1 },
  segment: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 2,
    cursor: 'pointer',
  },
});
