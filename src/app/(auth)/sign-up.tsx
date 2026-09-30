import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { CodeEntry } from '@/components/auth/CodeEntry';
import { PasswordField } from '@/components/auth/PasswordField';
import { PurposeCards } from '@/components/auth/PurposeCards';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { brand } from '@/config/brand';
import { toUserError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import {
  MIN_AGE,
  MIN_PASSWORD_LENGTH,
  dobToIso,
  formatDob,
  isAtLeastAge,
  isValidEmail,
  isValidPastDate,
  passwordHint,
} from '@/lib/validation';

type Step = 'cards' | 'form' | 'code';

/**
 * Sign-up state lives outside the component: verifying the code changes the session, which can
 * remount this screen on the way to onboarding. The password is never kept here past the form.
 */
const draft: { step: Step; email: string; dob: string } = { step: 'cards', email: '', dob: '' };

function dobProblem(dob: string): string | null {
  const iso = dobToIso(dob);
  if (!iso || !isValidPastDate(iso)) return 'Enter a real date in the past, like 04-23-1995.';
  if (!isAtLeastAge(iso, MIN_AGE))
    return `You must be at least ${MIN_AGE} to use ${brand.appName}.`;
  return null;
}

/** Captured silently and sent as signup metadata. */
function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default function SignUp() {
  const { spacing } = useTheme();
  const [step, setStep] = useState<Step>(draft.step);
  const [email, setEmail] = useState(draft.email);
  const [dob, setDob] = useState(draft.dob);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    draft.step = step;
    draft.email = email;
    draft.dob = dob;
  }, [step, email, dob]);

  const cleanEmail = email.trim().toLowerCase();
  const emailError = submitted && !isValidEmail(cleanEmail) ? 'Enter a valid email address.' : null;
  const dobError = dob.length === 10 || submitted ? dobProblem(dob) : null;
  const passwordError =
    submitted && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;

  async function createAccount() {
    if (sending.current) return;
    setError(null);
    setSubmitted(true);
    if (!isValidEmail(cleanEmail) || password.length < MIN_PASSWORD_LENGTH || dobProblem(dob))
      return;
    sending.current = true;
    setBusy(true);
    const { error: err } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { date_of_birth: dobToIso(dob), timezone: deviceTimezone() } },
    });
    setBusy(false);
    sending.current = false;
    if (err) return setError(toUserError(err, 'signUp').message);
    // With confirmations on, an email that already has an account gets a fake success and no
    // code. We show the same code step either way (and a "Log in" way out) so nothing leaks.
    setEmail(cleanEmail);
    setPassword('');
    setStep('code');
  }

  async function verify(token: string) {
    const { error: err } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'signup',
    });
    if (!err) {
      done.current = true;
      Object.assign(draft, { step: 'cards', email: '', dob: '' });
    }
    return err;
  }

  async function resend() {
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
    return err;
  }

  const title =
    step === 'cards'
      ? `What makes ${brand.appName} different`
      : step === 'form'
        ? 'Create your account'
        : 'Check your email';

  return (
    <Screen title="Create account" scroll center maxWidth={420} padded safeTop safeBottom>
      {step === 'cards' ? (
        <>
          <AuthHeader title={title} logo={56} />
          <PurposeCards onDone={() => setStep('form')} />
        </>
      ) : step === 'form' ? (
        <>
          <AuthHeader title={title} logo={56} />
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
              mode="new"
              label="Password"
              value={password}
              onChangeText={setPassword}
              hint={passwordHint(password) ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}
              error={passwordError}
              returnKeyType="next"
            />
            <TextField
              label="Date of birth"
              hint="MM-DD-YYYY. Required."
              value={dob}
              onChangeText={(t) => setDob(formatDob(t))}
              placeholder="04-23-1995"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="birthdate-full"
              maxLength={10}
              error={dobError}
              returnKeyType="go"
              onSubmitEditing={createAccount}
            />
            {error ? (
              <Text accessibilityRole="alert" variant="caption" tone="danger">
                {error}
              </Text>
            ) : null}
            <Button title="Create account" onPress={createAccount} loading={busy} />
            <Text variant="caption" tone="muted" align="center">
              By continuing you agree to the{' '}
              <Link href="/legal/terms" style={{ textDecorationLine: 'underline' }}>
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" style={{ textDecorationLine: 'underline' }}>
                Privacy Policy
              </Link>
              .
            </Text>
            <Button title="Back" variant="ghost" onPress={() => setStep('cards')} />
          </View>
        </>
      ) : (
        <>
          <AuthHeader title={title} logo={56} />
          <CodeEntry
            email={cleanEmail}
            verifyLabel="Verify and continue"
            intro={
              <Text align="center">
                If <Text weight="700">{cleanEmail}</Text> can create an account, we sent it a
                6-digit code.
              </Text>
            }
            onVerify={verify}
            onResend={resend}
            onBack={() => setStep('form')}
            backLabel="Use a different email"
          />
        </>
      )}
      {step === 'code' ? null : (
        <Button
          title="I already have an account"
          variant="ghost"
          onPress={() => router.replace('/log-in')}
        />
      )}
    </Screen>
  );
}
