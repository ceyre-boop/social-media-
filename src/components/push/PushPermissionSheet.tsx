import { StyleSheet, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { answerPushPermission, usePendingPushPermission } from '@/lib/push';
import { useTheme } from '@/lib/theme';

/**
 * The explainer shown before the OS permission prompt. Opened only by
 * requestPushPermission(reason) from a feature that needs push, never at launch.
 */
export function PushPermissionSheet() {
  const ask = usePendingPushPermission();
  const { spacing } = useTheme();
  return (
    <Sheet visible={!!ask} onClose={() => void answerPushPermission(false)} title="Turn on notifications?">
      <View style={[styles.body, { gap: spacing.md, paddingBottom: spacing.md }]}>
        <Text variant="body">{ask?.reason ?? ''}</Text>
        <Text variant="caption" tone="secondary">
          You choose which kinds you get, and nothing arrives during your quiet hours. You can change
          this any time in Settings.
        </Text>
        <Button title="Turn on notifications" onPress={() => void answerPushPermission(true)} />
        <Button title="Not now" variant="ghost" onPress={() => void answerPushPermission(false)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { alignSelf: 'stretch' } });
