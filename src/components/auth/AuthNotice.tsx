import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Neutral one-time message above an auth form (e.g. "Your session ended"). */
export function AuthNotice({ children }: { children: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.surface2,
        borderColor: colors.border,
        borderRadius: radius.md,
        borderWidth: 1,
        padding: 12,
      }}
    >
      <Text variant="caption" align="center">
        {children}
      </Text>
    </View>
  );
}
