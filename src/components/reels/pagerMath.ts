/** Touch paging decision for the web reels feed (see useWebTouchPager). */
export const THRESHOLD = 0.15; // of the page height
export const FLICK = 0.35; // px per ms of finger velocity

/** Pure decision, exported for tests. */
export function targetPage(
  startIndex: number,
  movedPx: number, // positive = content moved up (finger swiped up)
  velocityPxPerMs: number, // positive = finger moving up
  pageH: number,
  count: number,
): number {
  let dir = 0;
  if (Math.abs(movedPx) > THRESHOLD * pageH) dir = Math.sign(movedPx);
  else if (Math.abs(velocityPxPerMs) > FLICK) dir = Math.sign(velocityPxPerMs);
  return Math.max(0, Math.min(count - 1, startIndex + dir));
}
