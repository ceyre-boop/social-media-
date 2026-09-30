import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ReelsFeed, type FeedPageContext, type PageCursor } from '@/components/reels/ReelsFeed';
import { Button, LogoMark, Text } from '@/components/ui';
import { HOME_PAGE_SIZE, fetchHome } from '@/lib/feeds';
import type { FeedPost } from '@/lib/posts';
import { stage as c } from '@/lib/theme';

/** Module-level so the feed's refresh stays stable. Home is never refilled with strangers. */
async function loadHome(me: string, cursor?: PageCursor): Promise<FeedPost[]> {
  const page = await fetchHome(me, cursor ?? null);
  return page.posts;
}

/** Home is empty: point to Discover (a deliberate side door), never auto-fill with strangers. */
function HomeEmpty({ height, bottomInset }: FeedPageContext) {
  const router = useRouter();
  return (
    <View style={[styles.page, { height, paddingBottom: bottomInset }]}>
      <LogoMark size={88} />
      <Text variant="title" tone="onMedia" align="center">
        Your Home is quiet
      </Text>
      <Text tone="onMediaMuted" align="center" style={styles.message}>
        It fills with people you follow and keep coming back to. Discover has a few new faces when
        you feel like looking.
      </Text>
      <View style={styles.action}>
        <Button
          title="Go to Discover"
          variant="secondary"
          onPress={() => router.navigate('/discover')}
        />
      </View>
    </View>
  );
}

/** Home: people you return to, as reels. */
export default function Home() {
  return (
    <ReelsFeed
      title="Home"
      loadPage={loadHome}
      pageSize={HOME_PAGE_SIZE}
      emptyPage={(ctx) => <HomeEmpty {...ctx} />}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
    backgroundColor: c.surface,
  },
  message: { maxWidth: 320 },
  action: { width: 220 },
});
