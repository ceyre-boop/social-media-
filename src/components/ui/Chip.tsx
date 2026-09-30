import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Text } from './Text';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Over photos or video: fixed stage colors. */
  onMedia?: boolean;
};

/** Small non-interactive pill for status, e.g. post visibility or LIVE. */
export function Chip({ label, icon, onMedia }: Props) {
  const { colors, radius, spacing, stage } = useTheme();
  const bg = onMedia ? stage.control : colors.surface2;
  const border = onMedia ? stage.border : colors.border;
  const fg = onMedia ? stage.text : colors.textSecondary;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs + 1,
        borderWidth: 1,
        backgroundColor: bg,
        borderColor: border,
        borderRadius: radius.pill,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="micro" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
