import { View } from 'react-native';

import { Avatar, Sheet, Text } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/live/stub';
import type { Participant } from '@/lib/live/stub';
import { useTheme } from '@/lib/theme';

type Props = { visible: boolean; onClose: () => void; participants: Participant[] };

/** Who is here: avatar, name and a Host / Co-host / Guest / Viewer label. */
export function ParticipantsSheet({ visible, onClose, participants }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="In this stream" scroll>
      <View>
        {participants.map((p, i) => (
          <View
            key={p.username}
            accessible
            accessibilityLabel={`${p.displayName}, ${ROLE_LABEL[p.role]}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Avatar username={p.username} displayName={p.displayName} size="md" />
            <View style={{ flex: 1 }}>
              <Text variant="callout" numberOfLines={1}>
                {p.displayName}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                @{p.username}
              </Text>
            </View>
            <Text variant="caption" tone={p.role === 'viewer' ? 'muted' : 'secondary'} weight="700">
              {ROLE_LABEL[p.role]}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
