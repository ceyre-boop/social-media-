import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ProfileForm, type ProfileValues } from '@/components/profile-form';
import { AppBar, Button, IconButton, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useBreakpoint } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { USERNAME_RE } from '@/lib/validation';

export default function ProfileEdit() {
  const { colors, spacing } = useTheme();
  const { profile, refreshProfile, signOut, handleError } = useAuth();
  const router = useRouter();
  const compact = useBreakpoint() === 'compact';
  const [values, setValues] = useState<ProfileValues>({
    username: profile?.username ?? '',
    displayName: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leave = () => router.navigate('/you');

  async function save() {
    setError(null);
    setUsernameError(null);
    if (!profile) return;
    const name = values.username.trim();
    if (!USERNAME_RE.test(name)) return;
    setBusy(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        username: name,
        display_name: values.displayName.trim() || null,
        bio: values.bio.trim() || null,
      })
      .eq('user_id', profile.user_id);
    if (err) {
      setBusy(false);
      if (err.code === '23505') return setUsernameError('That username is taken');
      return setError(handleError(err, 'updateProfile').message);
    }
    await refreshProfile();
    setBusy(false);
    leave();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title="Edit profile"
        left={compact ? <IconButton icon="chevron-back" label="Back" onPress={leave} /> : undefined}
      />
      <Screen title="Edit profile" scroll padded safeBottom={false} clearNav>
        <ProfileForm values={values} onChange={setValues} usernameError={usernameError} />
        {error ? <Text tone="danger">{error}</Text> : null}
        <View style={{ gap: spacing.md }}>
          <Button
            title="Save"
            onPress={save}
            loading={busy}
            disabled={!USERNAME_RE.test(values.username.trim())}
          />
          <Button title="Cancel" variant="secondary" onPress={leave} />
          <Button title="Sign out" variant="danger" onPress={signOut} />
        </View>
      </Screen>
    </View>
  );
}
