import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { fontFamilyFor, useTheme } from '@/lib/theme';

import { Text } from './Text';

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  /** Shown bottom-right, e.g. "12/500". */
  counter?: string;
  /** Element pinned inside the right edge of the input (e.g. a show/hide toggle). */
  right?: React.ReactNode;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, counter, right, style, onFocus, onBlur, ...props },
  ref,
) {
  const { colors, radius, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.focus : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="callout">{label}</Text>
      <View>
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
              borderWidth: focused ? 2 : 1,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              color: colors.text,
              paddingHorizontal: spacing.lg - (focused ? 1 : 0),
              fontFamily: fontFamilyFor('400'),
              fontSize: type.body.fontSize,
            },
            props.multiline && styles.multiline,
            right ? { paddingRight: 72 } : null,
            style,
          ]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <View style={styles.meta}>
        <Text
          variant="caption"
          tone={error ? 'danger' : 'muted'}
          style={styles.metaText}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {error ?? hint ?? ''}
        </Text>
        {counter ? (
          <Text variant="caption" tone="muted">
            {counter}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    paddingVertical: 12,
    // Web: the focused border above replaces the browser default outline.
    outlineWidth: 0,
  },
  right: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metaText: { flexShrink: 1 },
});
