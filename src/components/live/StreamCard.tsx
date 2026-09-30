import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { formatViewers } from '@/lib/live/format';
import type { LiveStream } from '@/lib/live/stub';
import { useTheme } from '@/lib/theme';

import { LiveChip } from './LiveChip';

type Props = { stream: LiveStream; width: number; onPress: () => void };

/** Directory card: gradient thumbnail with host avatar, title and LIVE chip; host and viewers below. */
export function StreamCard({ stream, width, onPress }: Props) {
  const { brand, stage, colors, radius, spacing } = useTheme();
  const thumbH = Math.round(width * 1.25);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${stream.title}, hosted by ${stream.host.displayName}, ${formatViewers(stream.viewerCount)}`}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return {
          width,
          cursor: 'pointer',
          opacity: state.pressed ? 0.85 : 1,
          transform: [{ translateY: hovered ? -2 : 0 }],
        };
      }}
    >
      <View
        style={{
          height: thumbH,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: stage.bg,
        }}
      >
        <LinearGradient
          colors={[brand[stream.gradient[0]], brand[stream.gradient[1]]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={[stage.scrimClear, stage.scrimBottom]}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ position: 'absolute', top: spacing.sm, left: spacing.sm }}>
          <LiveChip />
        </View>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 28 }}
        >
          <Avatar
            username={stream.host.username}
            displayName={stream.host.displayName}
            size={width > 200 ? 'xl' : 'lg'}
          />
        </View>
        <Text
          variant="callout"
          tone="onMedia"
          numberOfLines={2}
          style={{
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            bottom: spacing.md,
          }}
        >
          {stream.title}
        </Text>
      </View>
      <View style={{ paddingTop: spacing.sm, paddingHorizontal: spacing.xs, gap: 1 }}>
        <Text variant="callout" numberOfLines={1}>
          {stream.host.displayName}
        </Text>
        <Text variant="caption" style={{ color: colors.muted }}>
          {formatViewers(stream.viewerCount)}
        </Text>
      </View>
    </Pressable>
  );
}
