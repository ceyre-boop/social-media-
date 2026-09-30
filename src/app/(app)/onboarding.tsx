import { useState } from 'react';
import { View } from 'react-native';

import { ProfileForm, type ProfileValues } from '@/components/profile-form';
import { Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { USERNAME_RE } from '@/lib/validation';

export default function Onboarding() {
  const { spacing } = useTheme();
  const { session, refreshProfile, signOut, handleError } = useAuth();
  const [values, setValues] = useState<ProfileValues>({ username: '', displayName: '', bio: '' });
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setUsernameError(null);
    if (!session) return;
    const name = values.username.trim();
    if (!USERNAME_RE.test(name)) return; // the field already shows the format error
    setBusy(true);
    const { error: err } = await supabase.from('profiles').insert({
      user_id: session.user.id,
      username: name,
      display_name: values.displayName.trim() || null,
      bio: values.bio.trim() || null,
    });
    if (err) {
      setBusy(false);
      if (err.code === '23505') {
        if (err.message.includes('profiles_pkey')) {
          // The profile already exists (e.g. an earlier fetch failed): just load it.
          await refreshProfile();
          return;
        }
        if (err.message.includes('profiles_username_key')) {
          return setUsernameError('That username is taken');
        }
      }
      return setError(handleError(err, 'createProfile').message);
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <Screen title="Create your profile" scroll center maxWidth={420} padded safeTop safeBottom>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display">Create your profile</Text>
        <Text tone="secondary">This is how people will know you on Smiley.</Text>
      </View>
      <ProfileForm values={values} onChange={setValues} usernameError={usernameError} />
      {error ? <Text tone="danger">{error}</Text> : null}
      <Button
        title="Create profile"
        onPress={save}
        loading={busy}
        disabled={!USERNAME_RE.test(values.username.trim())}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
