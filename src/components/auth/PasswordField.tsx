import { forwardRef, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

import { Text, TextField } from '@/components/ui';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
  hint?: string;
  error?: string | null;
  /** "new" for sign up / reset (password managers offer to generate), "current" for log in. */
  mode: 'new' | 'current';
};

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef<TextInput, Props>(function PasswordField(
  { mode, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      ref={ref}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
      textContentType={mode === 'new' ? 'newPassword' : 'password'}
      {...props}
      secureTextEntry={!shown}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          onPress={() => setShown((v) => !v)}
          hitSlop={8}
          style={{ paddingHorizontal: 12, paddingVertical: 8, cursor: 'pointer' }}
        >
          <Text variant="caption" tone="secondary" weight="700">
            {shown ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      }
    />
  );
});
