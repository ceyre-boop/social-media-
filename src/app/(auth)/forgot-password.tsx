import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { CodeEntry } from '@/components/auth/CodeEntry';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { toUserError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { MIN_PASSWORD_LENGTH, isValidEmail, passwordHint } from '@/lib/validation';

/** Survives the remount caused by the recovery code signing the person in. */
const draft = { email: '', sent: false };

/**
 * Email -> 6-digit recovery code -> new password. The code signs the person in, but `recovering`
 * keeps them on the auth screens (see RootStack) until the new password is saved.
 */
export default function ForgotPassword() {
  const { spacing } = useTheme();
  const { session, recovering, setRecovering, signOut } = useAuth();
  const [email, setEmailState] = useState(draft.email);
  const [sent, setSentState] = useState(draft.sent);
  const [password, setPassword] = useState('');
  const done = useRef(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEmail = setEmailState;
  const setSent = setSentState;

  useEffect(() => {
    if (done.current) return;
    draft.email = email;
    draft.sent = sent;
  }, [email, sent]);

  const cleanEmail = email.trim().toLowerCase();
  const step = recovering && session ? 'password' : sent ? 'code' : 'email';

  async function sendCode() {
    if (busy) return;
    setError(null);
    setSubmitted(true);
    if (!isValidEmail(cleanEmail)) return;
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    setBusy(false);
    if (err) return setError(toUserError(err, 'resetPasswordForEmail').message);
    setEmail(cleanEmail);
    setSent(true);
  }

  async function verify(token: string) {
    setRecovering(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'recovery',
    });
    if (err) setRecovering(false);
    return err;
  }

  async function resend() {
    const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    return err;
  }

  async function savePassword() {
    if (busy) return;
    setError(null);
    setSubmitted(true);
    if (password.length < MIN_PASSWORD_LENGTH) return;
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(toUserError(err, 'updateUser').message);
    done.current = true;
    Object.assign(draft, { email: '', sent: false });
    setRecovering(false); // the gate now routes to onboarding or Home
  }

  async function cancel() {
    done.current = true;
    Object.assign(draft, { email: '', sent: false });
    setRecovering(false);
    await signOut();
    router.replace('/log-in');
  }

  return (
    <Screen title="Reset password" scroll center maxWidth={420} padded safeTop safeBottom>
      <AuthHeader
        title={
          step === 'password'
            ? 'Choose a new password'
            : step === 'code'
              ? 'Check your email'
              : 'Reset your password'
        }
        subtitle={
          step === 'email' ? "Enter your email and we'll send you a 6-digit code." : undefined
        }
        logo={56}
      />

      {step === 'email' ? (
        <View style={{ gap: spacing.lg }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            error={submitted && !isValidEmail(cleanEmail) ? 'Enter a valid email address.' : null}
            returnKeyType="go"
            onSubmitEditing={sendCode}
          />
          {error ? (
            <Text accessibilityRole="alert" variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Send code" onPress={sendCode} loading={busy} />
          <Button
            title="Back to log in"
            variant="ghost"
            onPress={() => router.replace('/log-in')}
          />
        </View>
      ) : step === 'code' ? (
        <CodeEntry
          email={cleanEmail}
          intro={
            <Text align="center">
              If <Text weight="700">{cleanEmail}</Text> has an account, we sent it a 6-digit code.
            </Text>
          }
          onVerify={verify}
          onResend={resend}
          onBack={() => setSent(false)}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <PasswordField
            mode="new"
            label="New password"
            value={password}
            onChangeText={setPassword}
            hint={passwordHint(password) ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={
              submitted && password.length < MIN_PASSWORD_LENGTH
                ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
                : null
            }
            returnKeyType="go"
            onSubmitEditing={savePassword}
          />
          {error ? (
            <Text accessibilityRole="alert" variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Save password" onPress={savePassword} loading={busy} />
          <Button title="Cancel" variant="ghost" disabled={busy} onPress={cancel} />
        </View>
      )}
    </Screen>
  );
}
