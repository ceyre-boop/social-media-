import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { Button, IconButton, Text } from '@/components/ui';
import type { ReelDraft } from '@/lib/upload/reel';
import { useTheme } from '@/lib/theme';

function durationLabel(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ReelPreview({
  draft,
  disabled,
  onChange,
  onRemove,
}: {
  draft: ReelDraft;
  disabled: boolean;
  onChange: () => void;
  onRemove: () => void;
}) {
  const { radius, spacing, stage } = useTheme();
  const player = useVideoPlayer(draft.uri, (video) => {
    video.loop = true;
    video.muted = true;
    video.play();
  });
  useEffect(() => () => player.pause(), [player]);
  const rawRatio = draft.width && draft.height ? draft.width / draft.height : 9 / 16;
  const ratio = Math.max(0.5, Math.min(rawRatio, 1.1));

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={[
          styles.box,
          { aspectRatio: ratio, backgroundColor: stage.bg, borderRadius: radius.lg },
        ]}
      >
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.badge,
            {
              backgroundColor: stage.control,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
            },
          ]}
        >
          <Text variant="caption" weight="700" style={{ color: stage.text }}>
            {durationLabel(draft.durationMs)}
          </Text>
        </View>
        <IconButton
          icon="close"
          label="Remove reel"
          onPress={onRemove}
          disabled={disabled}
          onMedia
          style={styles.remove}
        />
      </View>
      <Button
        title="Change"
        variant="secondary"
        icon="videocam-outline"
        onPress={onChange}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', overflow: 'hidden', maxHeight: 540 },
  badge: { position: 'absolute', top: 8, left: 8 },
  remove: { position: 'absolute', top: 4, right: 4 },
});
