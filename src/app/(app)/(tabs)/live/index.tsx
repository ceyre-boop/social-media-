import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { StreamCard } from '@/components/live/StreamCard';
import { AppBar, EmptyState, PageTitle, Text } from '@/components/ui';
import { useNavClearance } from '@/lib/layout';
import { STUB_STREAMS } from '@/lib/live/stub';
import { useTheme } from '@/lib/theme';

const GAP = 12;

/** Live directory: "Live now" grid of sample streams. Preview only, no network. */
export default function LiveDirectory() {
  const router = useRouter();
  const clearance = useNavClearance();
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  const streams = STUB_STREAMS;

  const inner = Math.max(0, width - spacing.lg * 2);
  const cols = inner >= 800 ? 4 : inner >= 480 ? 3 : 2;
  const cardW = Math.floor((inner - GAP * (cols - 1)) / cols);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title="Live" />
      <AppBar title="Live now" />
      <ScrollView
        onLayout={onLayout}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl + clearance,
          gap: spacing.lg,
        }}
      >
        <Text variant="caption" tone="muted">
          Live is in preview. Streams here are samples.
        </Text>
        {streams.length === 0 ? (
          <EmptyState
            title="No one is live right now"
            message="When people go live, you'll find them here."
            actionLabel="Back to Home"
            onAction={() => router.navigate('/')}
          />
        ) : width > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: spacing.xl }}>
            {streams.map((s) => (
              <StreamCard
                key={s.id}
                stream={s}
                width={cardW}
                onPress={() => router.push({ pathname: '/live/[id]', params: { id: s.id } })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
