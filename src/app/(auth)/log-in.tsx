import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { AuthNotice } from '@/components/auth/AuthNotice';
import { CodeEntry } from '@/components/auth/CodeEntry';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { toUserError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { isValidEmail } from '@/lib/validation';

type Mode = 'password' | 'code';

/** Survives a remount caused by the session changing on the way into the app. */
const draft: { email: string; mode: Mode } = { email: '', mode: 'password' };

export default function LogIn() {
  const { spacing } = useTheme();
  const { notice, clearNotice } = useAuth();
  const [mode, setModeState] = useState<Mode>(draft.mode);
  const [email, setEmailState] = useState(draft.email);
  const [password, setPassword] = useState('');
  const done = useRef(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMode = setModeState;
  const setEmail = setEmailState;

  useEffect(() => {
    if (done.current) return;
    draft.email = email;
    draft.mode = mode;
  }, [email, mode]);

  const cleanEmail = email.trim().toLowerCase();
  const emailError = submitted && !isValidEmail(cleanEmail) ? 'Enter a valid email address.' : null;

  async function logIn() {
    if (busy) return;
    setError(null);
    setSubmitted(true);
    if (!isValidEmail(cleanEmail)) return;
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (err) return setError(toUserError(err, 'signInWithPassword').message);
    clearNotice();
    done.current = true;
    Object.assign(draft, { email: '', mode: 'password' });
    // The auth listener updates the session and the gate routes to onboarding or Home.
  }

  async function sendCode() {
    if (busy) return;
    setError(null);
    setSubmitted(true);
    if (!isValidEmail(cleanEmail)) return;
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) {
      const ue = toUserError(err, 'signInWithOtp');
      // "No such user" looks like any other failure here. Show the code step anyway so the
      // screen never reveals whether an email has an account.
      if (['network', 'timeout', 'rate_limit', 'server'].includes(ue.kind))
        return setError(ue.message);
    }
    clearNotice();
    setEmail(cleanEmail);
    setMode('code');
  }

  async function verify(token: string) {
    const { error: err } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'email',
    });
    if (!err) {
      done.current = true;
      Object.assign(draft, { email: '', mode: 'password' });
    }
    return err;
  }

  async function resend() {
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });
    return err && toUserError(err).kind === 'rate_limit' ? err : null;
  }

  return (
    <Screen title="Log in" scroll center maxWidth={420} padded safeTop safeBottom>
      <AuthHeader title={mode === 'password' ? 'Log in' : 'Check your email'} logo={56} />
      {notice ? <AuthNotice>{notice}</AuthNotice> : null}

      {mode === 'password' ? (
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
            error={emailError}
            returnKeyType="next"
          />
          <PasswordField
            mode="current"
            label="Password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={logIn}
          />
          {error ? (
            <Text accessibilityRole="alert" variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Log in" onPress={logIn} loading={busy} />
          <Button
            title="Forgot password?"
            variant="ghost"
            onPress={() => router.push('/forgot-password')}
          />
          <Button
            title="Email me a code instead"
            variant="secondary"
            disabled={busy}
            onPress={sendCode}
          />
          <Button
            title="New here? Create account"
            variant="ghost"
            onPress={() => router.replace('/sign-up')}
          />
        </View>
      ) : (
        <CodeEntry
          email={cleanEmail}
          intro={
            <Text align="center">
              If <Text weight="700">{cleanEmail}</Text> has an account, we sent it a 6-digit code.
            </Text>
          }
          onVerify={verify}
          onResend={resend}
          onBack={() => setMode('password')}
          backLabel="Log in with a password"
        />
      )}
    </Screen>
  );
}
