import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Group, LinkRow, Row, SettingsPage } from '@/components/settings/parts';
import { Button, Sheet, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';
import {
  cancelAccountDeletion,
  fetchOpenExport,
  fetchPendingDeletion,
  requestAccountDeletion,
  requestExport,
} from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function Account() {
  const { session, profile, signOut, handleError } = useAuth();
  const { spacing } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const me = session!.user.id;
  const username = profile?.username ?? '';

  const [exportOpen, setExportOpen] = useState<{ requested_at: string } | null>(null);
  const [deletion, setDeletion] = useState<{ scheduled_for: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const load = useCallback(() => {
    fetchOpenExport()
      .then(setExportOpen)
      .catch(() => {});
    fetchPendingDeletion()
      .then(setDeletion)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function askExport() {
    try {
      await requestExport(me);
      setExportOpen(await fetchOpenExport());
    } catch (e) {
      toast.show({ message: handleError(e, 'requestExport').message, tone: 'danger' });
    }
  }

  async function keepAccount() {
    try {
      await cancelAccountDeletion();
      setDeletion(null);
      toast.show({ message: 'Deletion cancelled. Your account stays as it is.', tone: 'success' });
    } catch (e) {
      toast.show({ message: handleError(e, 'cancelDeletion').message, tone: 'danger' });
    }
  }

  return (
    <SettingsPage title="Account">
      <Group title="You">
        <LinkRow
          first
          title="Name, username and bio"
          explain="Change how you appear to other people."
          onPress={() => router.push('/profile-edit')}
        />
        <Row title="Email" explain={session?.user.email ?? 'No email on this account'} />
        <Row
          title="Password"
          explain="Choose a new password."
          role="button"
          onPress={() => setPwOpen(true)}
          right={<Text tone="secondary">Change</Text>}
        />
        <Row
          title="Sign out"
          explain="You'll need to sign in again on this device."
          role="button"
          onPress={signOut}
          right={<Text tone="secondary">Sign out</Text>}
        />
      </Group>

      <Group title="Your data" note="We'll let you know here when it's ready.">
        <Row
          first
          title="Get a copy of your data"
          explain={
            exportOpen
              ? `You asked on ${day(exportOpen.requested_at)}. We'll let you know here when it's ready.`
              : 'Ask for a copy of what you have shared with us.'
          }
          right={
            exportOpen ? (
              <Text tone="secondary">Requested</Text>
            ) : (
              <Button title="Request" size="sm" variant="secondary" onPress={askExport} />
            )
          }
        />
      </Group>

      <View style={{ height: spacing.xl }} />
      <Group
        title="Delete your account"
        note="Anything you have earned or keep in messages is handled with care before anything is removed."
      >
        {deletion ? (
          <>
            <Row
              first
              title={`Your account will be deleted on ${day(deletion.scheduled_for)}`}
              explain="Until then everything is as it was. Changed your mind? You can keep your account."
            />
            <View style={{ padding: spacing.lg }}>
              <Button title="Keep my account" onPress={keepAccount} />
            </View>
          </>
        ) : (
          <Row
            first
            tone="danger"
            title="Delete my account"
            explain="You get 7 days to change your mind before it happens."
            role="button"
            onPress={() => setDelOpen(true)}
          />
        )}
      </Group>

      <PasswordSheet visible={pwOpen} onClose={() => setPwOpen(false)} />
      <DeleteSheet
        visible={delOpen}
        username={username}
        onClose={() => setDelOpen(false)}
        onDone={(when) => {
          setDelOpen(false);
          setDeletion({ scheduled_for: when });
        }}
      />
    </SettingsPage>
  );
}

function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (pw.length < MIN_PASSWORD_LENGTH)
      return setErr(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (pw !== again) return setErr("Those two don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error)
      return setErr("We couldn't change it. Try a different password, or sign in again and retry.");
    setPw('');
    setAgain('');
    onClose();
    toast.show({ message: 'Password changed.', tone: 'success' });
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Change your password">
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <TextField
          label="New password"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          autoComplete="new-password"
        />
        <TextField
          label="New password again"
          value={again}
          onChangeText={setAgain}
          secureTextEntry
          autoComplete="new-password"
          error={err}
        />
        <Button title="Change password" onPress={submit} loading={busy} disabled={!pw || !again} />
      </View>
    </Sheet>
  );
}

function DeleteSheet({
  visible,
  username,
  onClose,
  onDone,
}: {
  visible: boolean;
  username: string;
  onClose: () => void;
  onDone: (scheduledFor: string) => void;
}) {
  const { spacing } = useTheme();
  const { handleError } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === username.toLowerCase() && username !== '';

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const when = await requestAccountDeletion(typed.trim());
      setTyped('');
      onDone(when);
    } catch (e) {
      setErr(handleError(e, 'requestDeletion').message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Delete your account?">
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text>
          Your account will be scheduled for deletion in 7 days. Until then nothing changes, and you
          can cancel here at any time.
        </Text>
        <TextField
          label={`To confirm, type your username: ${username}`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          error={err}
        />
        <Button
          title="Delete my account"
          variant="danger"
          onPress={go}
          loading={busy}
          disabled={!matches}
        />
        <Button title="Keep my account" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
