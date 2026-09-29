import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { USERNAME_RE } from '@/lib/validation';

export default function Onboarding() {
  const { session, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!session) return;
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      return setError('Username must be 3-30 characters: letters, numbers, _ and . only.');
    }
    if (bio.length > 500) return setError('Bio can be at most 500 characters.');
    setBusy(true);
    const { error: err } = await supabase.from('profiles').insert({
      user_id: session.user.id,
      username: name,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
    });
    if (err) {
      setBusy(false);
      return setError(err.code === '23505' ? 'That username is taken' : err.message);
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field
          label="Username"
          hint="3-30 characters: letters, numbers, _ and ."
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
        <Button title="Create profile" onPress={save} loading={busy} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
});
