import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { USERNAME_RE } from '@/lib/validation';

export default function ProfileEdit() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!profile) return;
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      return setError('Username must be 3-30 characters: letters, numbers, _ and . only.');
    }
    setBusy(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        username: name,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      })
      .eq('user_id', profile.user_id);
    if (err) {
      setBusy(false);
      return setError(err.code === '23505' ? 'That username is taken' : err.message);
    }
    await refreshProfile();
    setBusy(false);
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
        />
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={60}
        />
        <Field
          label="Bio"
          hint={`${bio.length}/500`}
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
        />
        <ErrorText message={error} />
        <Button title="Save" onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
});
