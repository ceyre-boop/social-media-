import { EndOfFeed } from '@/components/reels/EndOfFeed';
import { ReelsFeed } from '@/components/reels/ReelsFeed';
import { fetchDiscover } from '@/lib/feeds';
import type { FeedPost } from '@/lib/posts';

/** One finite page (module-level so the feed's refresh stays stable). */
async function loadDiscover(me: string): Promise<FeedPost[]> {
  const page = await fetchDiscover(me);
  return page.posts;
}

/** Discover: a deliberate, finite side door. One page of posts, then a clear end. */
export default function Discover() {
  return (
    <ReelsFeed
      title="Discover"
      loadPage={loadDiscover}
      finite
      emptyPage={(ctx) => <EndOfFeed {...ctx} />}
      endPage={(ctx) => <EndOfFeed {...ctx} />}
    />
  );
}
