import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import type { ReelProgress } from '@/lib/upload/reel';
import { useTheme } from '@/lib/theme';

function formatBytes(value: number): string {
  const megabytes = value / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(1) : megabytes.toFixed(1)} MB`;
}

export function UploadProgress({
  progress,
  onCancel,
}: {
  progress: ReelProgress;
  onCancel: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.sent / progress.total) * 100)) : 0;
  const label =
    progress.phase === 'video'
      ? progress.resuming
        ? 'Resuming…'
        : 'Uploading video…'
      : progress.phase === 'poster'
        ? 'Uploading cover…'
        : 'Saving…';
  return (
    <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite">
      <Text variant="callout">{label}</Text>
      {progress.phase !== 'saving' ? (
        <>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Upload progress"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={[styles.track, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${percent}%`,
                  backgroundColor: colors.textSecondary,
                  borderRadius: radius.pill,
                },
              ]}
            />
          </View>
          <Text variant="caption" tone="muted">
            {percent}% · {formatBytes(progress.sent)} of {formatBytes(progress.total)}
          </Text>
        </>
      ) : null}
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, overflow: 'hidden' },
  fill: { height: '100%' },
});
