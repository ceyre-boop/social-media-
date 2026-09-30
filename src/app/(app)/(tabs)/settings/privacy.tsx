import { ChoiceGroup, Group, SettingsPage } from '@/components/settings/parts';
import { EmptyState, Text } from '@/components/ui';
import type { FriendRequestPolicy } from '@/lib/settings';
import { useUserSettings } from '@/lib/settings/useUserSettings';

const OPTIONS: { value: FriendRequestPolicy; label: string; explain: string }[] = [
  { value: 'everyone', label: 'Everyone', explain: 'Anyone can ask to be your friend.' },
  {
    value: 'following',
    label: 'People you follow',
    explain: 'Only people you follow can ask. Everyone else is politely turned away.',
  },
  {
    value: 'nobody',
    label: 'Nobody',
    explain: 'No new friend requests. Friends you already have stay friends.',
  },
];

export default function Privacy() {
  const { settings, error, reload, save } = useUserSettings();
  return (
    <SettingsPage title="Privacy">
      {error && !settings ? (
        <EmptyState
          compact
          title={error.title}
          message={error.message}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : settings ? (
        <>
          <ChoiceGroup
            title="Who can send you a friend request"
            note="Friends can see your Moments. The person asking is never told which rule stopped them."
            options={OPTIONS}
            value={settings.friend_requests_from}
            onChange={(v) => save({ friend_requests_from: v })}
          />
          <Group>
            <Text style={{ padding: 16 }} variant="callout" tone="secondary">
              Who can see each post is chosen when you post it. Nobody can see a count of your
              followers.
            </Text>
          </Group>
        </>
      ) : null}
    </SettingsPage>
  );
}
