import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { brand } from '@/config/brand';
import { Button, LogoMark, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { toUserError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { deviceTimezone } from '@/lib/timezone';
import {
  MIN_AGE,
  dobToIso,
  formatDob,
  isAtLeastAge,
  isValidEmail,
  isValidPastDate,
} from '@/lib/validation';

const RESEND_SECONDS = 30;

/**
 * Form state lives outside the component. If anything above us ever remounts this screen
 * (auth events, redirects, hot reload) the user's email/DOB/step come back instead of vanishing.
 */
const draft = { email: '', dob: '', codeSent: false, resendAt: 0 };

function dobProblem(dob: string): string | null {
  const iso = dobToIso(dob);
  if (!iso || !isValidPastDate(iso)) return 'Enter a real date in the past, like 04-23-1995.';
  if (!isAtLeastAge(iso, MIN_AGE))
    return `You must be at least ${MIN_AGE} to use ${brand.appName}.`;
  return null;
}

export default function SignIn() {
  const { colors, radius, spacing } = useTheme();
  const { notice, clearNotice } = useAuth();
  const [email, setEmail] = useState(draft.email);
  const [dob, setDob] = useState(draft.dob);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(draft.codeSent);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(draft.resendAt);
  const [now, setNow] = useState(() => Date.now());
  const verifying = useRef(false);
  const codeRef = useRef<TextInput>(null);
  const sending = useRef(false);
  const signedIn = useRef(false);

  useEffect(() => {
    if (signedIn.current) return;
    draft.email = email;
    draft.dob = dob;
    draft.codeSent = codeSent;
    draft.resendAt = resendAt;
  }, [email, dob, codeSent, resendAt]);

  // RN-web ignores autoFocus on late-mounted inputs, so focus the code field explicitly.
  useEffect(() => {
    if (!codeSent) return;
    const t = setTimeout(() => codeRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [codeSent]);

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldown]);

  const cleanEmail = email.trim().toLowerCase();
  const emailError = submitted && !isValidEmail(cleanEmail) ? 'Enter a valid email address.' : null;
  const dobError = dob.length === 10 || submitted ? dobProblem(dob) : null;

  async function send(isResend = false) {
    if (sending.current) return;
    setError(null);
    setSubmitted(true);
    if (!isValidEmail(cleanEmail) || dobProblem(dob)) return;
    sending.current = true;
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        data: { date_of_birth: dobToIso(dob), timezone: deviceTimezone() },
      },
    });
    setBusy(false);
    sending.current = false;
    if (err) {
      const ue = toUserError(err, 'signInWithOtp');
      if (ue.kind === 'rate_limit' && ue.retryAfter) {
        setNow(Date.now());
        setResendAt(Date.now() + ue.retryAfter * 1000);
      }
      return setError(ue.message);
    }
    clearNotice();
    setEmail(cleanEmail);
    setCodeSent(true);
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    if (isResend) setCode('');
  }

  async function verify(token: string) {
    if (verifying.current) return;
    setError(null);
    if (!/^\d{6}$/.test(token)) return setError('The code is 6 digits.');
    verifying.current = true;
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'email',
    });
    setBusy(false);
    verifying.current = false;
    if (err) {
      const ue = toUserError(err, 'verifyOtp');
      // Wrong/expired code: clear it so they can retype or resend. Network: keep it to retry.
      if (ue.kind === 'code') setCode('');
      setError(ue.message);
    } else {
      signedIn.current = true;
      Object.assign(draft, { email: '', dob: '', codeSent: false, resendAt: 0 });
    }
    // On success the auth listener updates the session and the router redirects.
  }

  function onCodeChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  return (
    <Screen title="Sign in" scroll center maxWidth={420} padded safeTop safeBottom>
      <View style={styles.header}>
        <LogoMark size={96} />
        <Text variant="display" align="center">
          Welcome to {brand.appName}
        </Text>
        <Text tone="secondary" align="center">
          {brand.tagline}
        </Text>
      </View>

      {notice ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <Text variant="caption" align="center">
            {notice}
          </Text>
        </View>
      ) : null}

      {!codeSent ? (
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
            onSubmitEditing={() => send()}
          />
          {error ? (
            <Text accessibilityRole="alert" variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Send code" onPress={() => send()} loading={busy} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Text align="center">
            We sent a 6-digit code to <Text weight="700">{cleanEmail}</Text>.
          </Text>
          <TextField
            label="Code"
            ref={codeRef}
            value={code}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="······"
            error={error}
            editable={!busy}
            style={styles.code}
          />
          <Button
            title="Verify"
            onPress={() => verify(code)}
            loading={busy}
            disabled={code.length !== 6}
          />
          <Button
            title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            variant="ghost"
            disabled={cooldown > 0 || busy}
            onPress={() => send(true)}
          />
          <Button
            title="Use a different email"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setCodeSent(false);
              setCode('');
              setError(null);
              setResendAt(0);
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 12, marginBottom: 8 },
  notice: { borderWidth: 1, padding: 12 },
  code: { fontSize: 32, letterSpacing: 12, textAlign: 'center', minHeight: 64 },
});
