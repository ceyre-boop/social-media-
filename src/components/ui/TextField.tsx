import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  /** Shown bottom-right, e.g. "12/500". */
  counter?: string;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, counter, style, onFocus, onBlur, ...props },
  ref,
) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            borderColor,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            color: colors.text,
            paddingHorizontal: spacing.lg,
          },
          props.multiline && styles.multiline,
          style,
        ]}
      />
      <View style={styles.meta}>
        <Text
          style={[styles.metaText, { color: error ? colors.danger : colors.muted }]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {error ?? hint ?? ''}
        </Text>
        {counter ? <Text style={[styles.metaText, { color: colors.muted }]}>{counter}</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    paddingVertical: 12,
    fontSize: 16,
    // Web: our global :focus-visible ring replaces the browser default.
    outlineWidth: 0,
  },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metaText: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
