import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { toUserError } from '@/lib/errors';
import { useTheme } from '@/lib/theme';

const RESEND_SECONDS = 30;

type Props = {
  email: string;
  /** Returns an error (anything supabase returned) or null on success. */
  onVerify: (token: string) => Promise<unknown>;
  /** Returns an error or null. Called for "Resend code". */
  onResend: () => Promise<unknown>;
  /** "Use a different email" / back. */
  onBack: () => void;
  backLabel?: string;
  verifyLabel?: string;
  /** Copy above the field; defaults to "We sent a 6-digit code to <email>." */
  intro?: React.ReactNode;
};

/** 6-digit code field with verify, resend cooldown and a way back. Shared by every code step. */
export function CodeEntry({
  email,
  onVerify,
  onResend,
  onBack,
  backLabel = 'Use a different email',
  verifyLabel = 'Verify',
  intro,
}: Props) {
  const { spacing } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const verifying = useRef(false);
  const codeRef = useRef<TextInput>(null);

  // RN-web ignores autoFocus on late-mounted inputs, so focus the code field explicitly.
  useEffect(() => {
    const t = setTimeout(() => codeRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldown]);

  async function verify(token: string) {
    if (verifying.current) return;
    setError(null);
    if (!/^\d{6}$/.test(token)) return setError('The code is 6 digits.');
    verifying.current = true;
    setBusy(true);
    const err = await onVerify(token);
    setBusy(false);
    verifying.current = false;
    if (err) {
      const ue = toUserError(err, 'verifyOtp');
      // Wrong/expired code: clear it so they can retype or resend. Network: keep it to retry.
      if (ue.kind === 'code') setCode('');
      setError(ue.message);
    }
    // On success the caller moves on (or the auth listener redirects).
  }

  async function resend() {
    setError(null);
    setBusy(true);
    const err = await onResend();
    setBusy(false);
    if (err) {
      const ue = toUserError(err, 'resend');
      if (ue.kind === 'rate_limit' && ue.retryAfter) setResendAt(Date.now() + ue.retryAfter * 1000);
      return setError(ue.message);
    }
    setCode('');
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
  }

  function onChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {intro ?? (
        <Text align="center">
          We sent a 6-digit code to <Text weight="700">{email}</Text>.
        </Text>
      )}
      <TextField
        label="Code"
        ref={codeRef}
        value={code}
        onChangeText={onChange}
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
        title={verifyLabel}
        onPress={() => verify(code)}
        loading={busy}
        disabled={code.length !== 6}
      />
      <Button
        title={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        variant="ghost"
        disabled={cooldown > 0 || busy}
        onPress={resend}
      />
      <Button title={backLabel} variant="ghost" disabled={busy} onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 32, letterSpacing: 12, textAlign: 'center', minHeight: 64 },
});
