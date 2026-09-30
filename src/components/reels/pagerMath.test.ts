import { describe, expect, test } from 'bun:test';

import { FLICK, THRESHOLD, targetPage } from './pagerMath';

const H = 844;
const N = 20;

describe('targetPage — one swipe, one whole reel', () => {
  test('a soft swipe past the threshold goes to the next reel', () => {
    expect(targetPage(3, THRESHOLD * H + 1, 0, H, N)).toBe(4);
  });
  test('a soft swipe back past the threshold goes to the previous reel', () => {
    expect(targetPage(3, -(THRESHOLD * H + 1), 0, H, N)).toBe(2);
  });
  test('a tiny drag with no flick snaps back', () => {
    expect(targetPage(3, 40, 0.05, H, N)).toBe(3);
  });
  test('a short fast flick advances even under the distance threshold', () => {
    expect(targetPage(3, 30, FLICK + 0.1, H, N)).toBe(4);
  });
  test('a huge fling never skips more than one reel', () => {
    expect(targetPage(3, 3 * H, 9, H, N)).toBe(4);
  });
  test('clamped at both ends', () => {
    expect(targetPage(0, -500, -2, H, N)).toBe(0);
    expect(targetPage(N - 1, 500, 2, H, N)).toBe(N - 1);
  });
});
