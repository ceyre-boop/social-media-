import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { isValidEmail, isValidPastDate } from '@/lib/validation';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return setError('Enter a valid email address.');
    if (!isValidPastDate(dob.trim())) {
      return setError('Enter your date of birth as YYYY-MM-DD (a real date in the past).');
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true, data: { date_of_birth: dob.trim() } },
    });
    setBusy(false);
    if (err) return setError(`Could not send the code: ${err.message}`);
    setEmail(cleanEmail);
    setCodeSent(true);
  }

  async function verify() {
    setError(null);
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) return setError('The code is 6 digits.');
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) setError(`That code did not work: ${err.message}`);
    // On success the auth listener updates the session and the router redirects.
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>Smiley</Text>
          <Text style={styles.tagline}>Sign in or create an account.</Text>
        </View>

        {!codeSent ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Date of birth"
              hint="YYYY-MM-DD. Required."
              value={dob}
              onChangeText={setDob}
              placeholder="1995-04-23"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <ErrorText message={error} />
            <Button title="Send code" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <Text style={styles.info}>We sent a 6-digit code to {email}.</Text>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
            <ErrorText message={error} />
            <Button title="Verify" onPress={verify} loading={busy} />
            <Button
              title="Use a different email"
              variant="secondary"
              onPress={() => {
                setCodeSent(false);
                setCode('');
                setError(null);
              }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  logo: { fontSize: 40, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 16, color: colors.muted },
  info: { fontSize: 16, color: colors.text },
});
