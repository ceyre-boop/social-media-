import { useEffect, useMemo } from 'react';

import { STUB_ANCHOR_HZ, STUB_VIDEO_DELAY_MS, stubAnchorSampleAt } from '@/lib/live/stub';

import { AnchorBuffer } from './engine';

export type AnchorFeed = {
  buffer: AnchorBuffer;
  /** PTS of the video frame on screen right now: the metadata clock minus the video delay. */
  displayedPts: () => number;
  delayMs: number;
  sway: number;
};

/**
 * Feeds a buffer from the STUB anchor stream: samples at 12 Hz stamped with capture time,
 * while the "video" lags by 3s, so PTS matching is genuinely exercised. Replace the interval
 * with the real metadata subscription later; the buffer and engine do not change.
 * `sway` 0 holds the imaginary creator still (reduced motion).
 */
export function useAnchorFeed(sway = 1): AnchorFeed {
  const feed = useMemo<AnchorFeed>(
    () => ({
      buffer: new AnchorBuffer(),
      displayedPts: () => Date.now() - STUB_VIDEO_DELAY_MS,
      delayMs: STUB_VIDEO_DELAY_MS,
      sway,
    }),
    [sway],
  );

  useEffect(() => {
    const now = Date.now();
    // Catch-up history so the first gift after joining can anchor straight away.
    const step = 1000 / STUB_ANCHOR_HZ;
    for (let t = now - STUB_VIDEO_DELAY_MS - 2000; t <= now; t += step) {
      feed.buffer.push(stubAnchorSampleAt(Math.round(t), sway));
    }
    const id = setInterval(() => feed.buffer.push(stubAnchorSampleAt(Date.now(), sway)), step);
    return () => clearInterval(id);
  }, [feed, sway]);

  return feed;
}
