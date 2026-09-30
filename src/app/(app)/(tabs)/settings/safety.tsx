import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChoiceGroup, Group, Row, SettingsPage, type Choice } from '@/components/settings/parts';
import { Button, EmptyState, Sheet, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ALWAYS_BLOCKED, LEVEL_COPY } from '@/lib/contentFilter/copy';
import { allowedLevels } from '@/lib/contentFilter/levels';
import { searchUsers, type SearchResult } from '@/lib/search';
import {
  addToCircle,
  fetchBlockedUsers,
  fetchCircle,
  removeFromCircle,
  unblockUser,
  isAdultDob,
  type BlockedUser,
  type CircleMember,
  type SpeechLevel,
} from '@/lib/settings';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { useTheme } from '@/lib/theme';

/** The dial's stops, each with one plain line and a short example. Minors see Family and Standard. */
function dial(adult: boolean): Choice<SpeechLevel>[] {
  return allowedLevels(adult).map((l) => ({
    value: l,
    label: LEVEL_COPY[l].label,
    explain: `${LEVEL_COPY[l].line} ${LEVEL_COPY[l].example}`,
  }));
}

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
        <>
          <ChoiceGroup
            title="What you see"
            note={
              isAdultDob(settings.date_of_birth)
                ? 'Also what people can send you in messages and replies. Anything above your level is hidden, and you can tap Show.'
                : 'Also what people can send you in messages and replies. Under 18, you can pick Family or Standard.'
            }
            options={dial(isAdultDob(settings.date_of_birth))}
            value={settings.speech_level}
            onChange={(v) => save({ speech_level: v })}
          />
          <ChoiceGroup
            title="Your room"
            note="Where your live chat and the comments on your new posts start. Each viewer still sees no more than their own level."
            options={dial(isAdultDob(settings.date_of_birth))}
            value={settings.default_room_level}
            onChange={(v) => save({ default_room_level: v })}
          />
          <Group
            title="Never allowed, at any level"
            note="You can reword and resend straight away. Threats and anything putting a young person at risk go to a person on our safety team."
          >
            <View style={{ padding: 16, gap: 6 }}>
              {ALWAYS_BLOCKED.map((line) => (
                <Text key={line} variant="callout">
                  {`• ${line}`}
                </Text>
              ))}
            </View>
          </Group>
        </>
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
