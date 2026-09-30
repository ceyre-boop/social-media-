import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps, TextStyle } from 'react-native';

import { fontFamilyFor, useTheme } from '@/lib/theme';
import type { FontWeight, TypeVariant } from '@/lib/theme';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'onPrimary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'onMedia'
  | 'onMediaMuted';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Override the variant's weight (rare). */
  weight?: FontWeight;
  align?: TextStyle['textAlign'];
};

/** The only text primitive. Screens never import Text from react-native. */
export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  align,
  style,
  ...props
}: TextProps) {
  const { colors, stage, type } = useTheme();
  const t = type[variant];
  const color = {
    default: colors.text,
    secondary: colors.textSecondary,
    muted: colors.muted,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    info: colors.info,
    onMedia: stage.text,
    onMediaMuted: stage.textSecondary,
  }[tone];

  return (
    <RNText
      {...props}
      style={[
        {
          fontFamily: fontFamilyFor(weight ?? t.fontWeight),
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          letterSpacing: t.letterSpacing,
          textTransform: t.textTransform,
          color,
        },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
