import type { Moment } from './index';

/** Last loaded Moments, so the viewer opens instantly from the row; it refetches anyway. */
let cached: Moment[] | null = null;

export function setMomentsCache(list: Moment[]): void {
  cached = list;
}

export function getMomentsCache(): Moment[] | null {
  return cached;
}
