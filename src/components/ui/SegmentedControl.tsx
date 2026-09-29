import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

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
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
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
            <Ionicons name={s.icon} size={18} color={active ? colors.onPrimary : colors.muted} />
            <Text
              numberOfLines={1}
              style={[styles.text, { color: active ? colors.onPrimary : colors.text }]}
            >
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small pill for status, e.g. post visibility. */
export function Chip({ label, icon }: { label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.pill },
      ]}
    >
      {icon ? <Ionicons name={icon} size={12} color={colors.muted} /> : null}
      <Text style={[styles.chipText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 4, borderWidth: 1, gap: 4 },
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
  text: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
});
