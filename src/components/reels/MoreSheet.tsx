import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import type { Visibility } from '@/lib/posts';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

/** Small sheet from the "more" button: who can see this post. Nothing else exists yet. */
export function MoreSheet({
  visible,
  visibility,
  onClose,
}: {
  visible: boolean;
  visibility: Visibility;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const meta = VISIBILITY_META[visibility];
  return (
    <Sheet visible={visible} onClose={onClose} title="Who can see this">
      <View style={{ gap: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name={meta.icon} size={24} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="callout" weight="700">
              {meta.label}
            </Text>
            <Text variant="caption" tone="secondary" style={{ marginTop: spacing.xxs }}>
              {meta.explain}
            </Text>
          </View>
        </View>
        <Button title="Close" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
