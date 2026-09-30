import { View } from 'react-native';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';
import type { ElevationLevel } from '@/lib/theme';

type Props = ViewProps & {
  /** 0 flat (border only) through 3 (dialogs). Default 1. */
  elevation?: ElevationLevel;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Surface + border + radius + elevation. The default container for grouped content. */
export function Card({ elevation = 1, padded = true, style, ...props }: Props) {
  const { colors, radius, spacing, elevation: shadows } = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? spacing.lg : 0,
        },
        shadows[elevation],
        style,
      ]}
    />
  );
}
