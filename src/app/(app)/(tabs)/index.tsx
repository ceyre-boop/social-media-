import { ReelsFeed } from '@/components/reels/ReelsFeed';
import { fetchFeedPage } from '@/lib/posts';

/** Home: the reels feed. */
export default function Home() {
  return <ReelsFeed title="Home" loadPage={fetchFeedPage} />;
}
