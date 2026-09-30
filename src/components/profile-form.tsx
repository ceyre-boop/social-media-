import { StyleSheet, View } from 'react-native';

import { Avatar, TextField } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { USERNAME_RE } from '@/lib/validation';

export const BIO_MAX = 500;

export type ProfileValues = { username: string; displayName: string; bio: string };

/** Shared by onboarding and profile edit so both look and behave the same. */
export function ProfileForm({
  values,
  onChange,
  usernameError,
}: {
  values: ProfileValues;
  onChange: (next: ProfileValues) => void;
  /** Server-side error such as "That username is taken". */
  usernameError?: string | null;
}) {
  const { spacing } = useTheme();
  const name = values.username.trim();
  const formatOk = USERNAME_RE.test(name);
  const hint =
    name.length === 0
      ? '3-30 characters: letters, numbers, _ and .'
      : formatOk
        ? 'Looks good.'
        : 'Use 3-30 letters, numbers, _ or . (no spaces).';

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.avatar}>
        <Avatar username={name || '?'} displayName={values.displayName} size="xl" />
      </View>
      <TextField
        label="Username"
        hint={hint}
        error={usernameError ?? (name.length > 0 && !formatOk ? hint : null)}
        value={values.username}
        onChangeText={(t) => onChange({ ...values, username: t })}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={30}
      />
      <TextField
        label="Display name"
        value={values.displayName}
        onChangeText={(t) => onChange({ ...values, displayName: t })}
        autoComplete="name"
        maxLength={60}
      />
      <TextField
        label="Bio"
        value={values.bio}
        onChangeText={(t) => onChange({ ...values, bio: t })}
        counter={`${values.bio.length}/${BIO_MAX}`}
        multiline
        maxLength={BIO_MAX}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center' },
});
