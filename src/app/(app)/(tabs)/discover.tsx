import { EndOfFeed } from '@/components/reels/EndOfFeed';
import { ReelsFeed } from '@/components/reels/ReelsFeed';
import type { FeedPost } from '@/lib/posts';

/**
 * Placeholder data source: Discover has no posts until `fetchDiscover` (src/lib/feeds.ts) is
 * wired here. Keep it a module-level function so the feed's refresh stays stable.
 */
async function loadDiscover(): Promise<FeedPost[]> {
  return [];
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
