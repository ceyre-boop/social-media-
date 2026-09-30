import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChoiceGroup, Group, Row, SettingsPage } from '@/components/settings/parts';
import { Button, EmptyState, Sheet, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { searchUsers, type SearchResult } from '@/lib/search';
import {
  addToCircle,
  fetchBlockedUsers,
  fetchCircle,
  removeFromCircle,
  unblockUser,
  type BlockedUser,
  type ChatStrictness,
  type CircleMember,
} from '@/lib/settings';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { useTheme } from '@/lib/theme';

const STRICTNESS: { value: ChatStrictness; label: string; explain: string }[] = [
  {
    value: 'open',
    label: 'Open',
    explain:
      'Fewer interruptions. Mildly unkind messages go through. Serious harm is still stopped.',
  },
  {
    value: 'standard',
    label: 'Standard',
    explain:
      'Mildly unkind messages get a gentle "are you sure?" first. The sender can still send.',
  },
  {
    value: 'protected',
    label: 'Protected',
    explain: 'Mildly unkind messages are held back, and so are messages from brand-new accounts.',
  },
];

export default function Safety() {
  const { session, handleError } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const { settings, error, reload, save } = useUserSettings();
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [circle, setCircle] = useState<CircleMember[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetchBlockedUsers()
      .then(setBlocked)
      .catch((e) => toast.show({ message: handleError(e, 'blocked').message, tone: 'danger' }));
    fetchCircle(me)
      .then(setCircle)
      .catch((e) => toast.show({ message: handleError(e, 'circle').message, tone: 'danger' }));
  }, [me, handleError, toast]);
  useEffect(load, [load]);

  async function unblock(u: BlockedUser) {
    try {
      await unblockUser(me, u.user_id);
      setBlocked((b) => (b ?? []).filter((x) => x.user_id !== u.user_id));
      toast.show({ message: 'Unblocked.' });
    } catch (e) {
      toast.show({ message: handleError(e, 'unblock').message, tone: 'danger' });
    }
  }

  async function remove(m: CircleMember) {
    try {
      await removeFromCircle(me, m.user_id);
      setCircle((c) => (c ?? []).filter((x) => x.user_id !== m.user_id));
    } catch (e) {
      toast.show({ message: handleError(e, 'circleRemove').message, tone: 'danger' });
    }
  }

  return (
    <SettingsPage title="Safety">
      {error && !settings ? (
        <EmptyState
          compact
          title={error.title}
          message={error.message}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : null}
      {settings ? (
        <ChoiceGroup
          title="Chat on your live streams"
          note="Applies to streams you start from now on. The most serious things (threats, harassment, anything that puts someone at risk) are always stopped, whichever you pick. You can make chat stricter, but never looser than that."
          options={STRICTNESS}
          value={settings.default_chat_strictness}
          onChange={(v) => save({ default_chat_strictness: v })}
        />
      ) : null}

      <Group
        title="Your Trusted Circle"
        note='People you trust skip the gentle "are you sure?" in your live chat. They are still stopped for anything serious. Only you can see this list.'
      >
        {(circle ?? []).map((m, i) => (
          <Row
            key={m.user_id}
            first={i === 0}
            title={m.display_name || m.username}
            explain={`@${m.username}`}
            right={
              <Button title="Remove" size="sm" variant="secondary" onPress={() => remove(m)} />
            }
          />
        ))}
        {circle && circle.length === 0 ? (
          <Text style={{ padding: 16 }} tone="secondary" variant="callout">
            Nobody yet.
          </Text>
        ) : null}
        <Row
          title="Add someone"
          explain="Search for a person by name."
          role="button"
          onPress={() => setAdding(true)}
          right={<Text tone="secondary">Add</Text>}
        />
      </Group>

      <Group
        title="People you blocked"
        note="Blocked people can't find you, follow you, message you or see what you post. They are never told."
      >
        {(blocked ?? []).map((u, i) => (
          <Row
            key={u.user_id}
            first={i === 0}
            title={u.display_name || u.username || 'Unknown person'}
            explain={u.username ? `@${u.username}` : undefined}
            right={
              <Button title="Unblock" size="sm" variant="secondary" onPress={() => unblock(u)} />
            }
          />
        ))}
        {blocked && blocked.length === 0 ? (
          <Text style={{ padding: 16 }} tone="secondary" variant="callout">
            You haven&apos;t blocked anyone.
          </Text>
        ) : null}
      </Group>

      <AddToCircle
        visible={adding}
        existing={(circle ?? []).map((c) => c.user_id)}
        onClose={() => setAdding(false)}
        onAdd={async (p) => {
          try {
            await addToCircle(me, p.user_id);
            setCircle(await fetchCircle(me));
            setAdding(false);
          } catch (e) {
            toast.show({ message: handleError(e, 'circleAdd').message, tone: 'danger' });
          }
        }}
      />
    </SettingsPage>
  );
}

function AddToCircle({
  visible,
  existing,
  onClose,
  onAdd,
}: {
  visible: boolean;
  existing: string[];
  onClose: () => void;
  onAdd: (p: SearchResult) => void;
}) {
  const { spacing } = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) return setResults([]);
      searchUsers(term, 8)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Add to your Trusted Circle" scroll>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <TextField
          label="Search by name or username"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {results.map((p) => (
          <View
            key={p.user_id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <View style={{ flex: 1 }}>
              <Text weight="600">{p.display_name || p.username}</Text>
              <Text variant="callout" tone="secondary">
                @{p.username}
              </Text>
            </View>
            {existing.includes(p.user_id) ? (
              <Text tone="secondary">Added</Text>
            ) : (
              <Button title="Add" size="sm" variant="secondary" onPress={() => onAdd(p)} />
            )}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
