import { useEffect, type RefObject } from 'react';
import { Platform, type View } from 'react-native';

/**
 * Web + touch only: one swipe = exactly one reel, fully centered.
 *
 * CSS scroll-snap leaves the decision to the browser: a soft swipe snaps back, a
 * fling can land between pages on iOS Safari (FlashList cells are absolutely
 * positioned, which Safari's snap areas handle poorly). So on touch screens we
 * decide ourselves when the finger lifts:
 *   - moved past THRESHOLD of the page, or flicked faster than FLICK → next/previous reel
 *   - otherwise → back to the reel you started on
 * and glide there. Never more than one reel per swipe. The feed's existing
 * scroll-idle settle then commits the index, which starts playback.
 *
 * CSS snap stays on for mouse/trackpad (see +html.tsx: disabled for coarse pointers).
 */
import { targetPage } from './pagerMath';

function findScroller(root: HTMLElement): HTMLElement | null {
  const marked = root.querySelector<HTMLElement>('[data-reels]');
  if (marked) return marked;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('div'))) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10) return el;
  }
  return null;
}

export function useWebTouchPager(rootRef: RefObject<View | null>, pageH: number, count: number, enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || pageH <= 0 || count <= 0) return;
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) return;

    let scroller: HTMLElement | null = null;
    let startIndex = 0;
    let startY = 0; // finger position at touchstart
    let lastY = 0;
    let lastT = 0;
    // Recent finger samples. Velocity is measured over a ~100 ms window, not between two
    // events: touch events can arrive bunched together, which makes per-event speed spike.
    let samples: { y: number; t: number }[] = [];
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    const onStart = (e: TouchEvent) => {
      scroller = findScroller(root);
      if (!scroller || e.touches.length !== 1) return;
      if (releaseTimer) clearTimeout(releaseTimer);
      scroller.style.overflowY = '';
      // The list sets scroll-snap inline (pagingEnabled), which beats the stylesheet;
      // browser snapping would fight our glide, so turn it off on the element itself.
      scroller.style.scrollSnapType = 'none';
      startIndex = Math.round(scroller.scrollTop / pageH);
      startY = e.touches[0].clientY;
      lastY = startY;
      lastT = performance.now();
      samples = [{ y: startY, t: lastT }];
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const t = performance.now();
      lastY = y;
      lastT = t;
      samples.push({ y, t });
      while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
    };

    const onEnd = () => {
      const el = scroller;
      if (!el) return;
      // px/ms over the recent window, positive = finger moving up. A finger that rested
      // before lifting, or a window too short to measure, isn't a flick.
      const first = samples[0];
      const span = lastT - (first?.t ?? lastT);
      const velocity =
        performance.now() - lastT > 80 || span < 30 ? 0 : (first.y - lastY) / span;
      // Measure the finger, not scrollTop: the browser applies scroll asynchronously, so
      // scrollTop can lag the gesture at touchend. A 1:1 drag moves content by finger travel.
      const target = targetPage(startIndex, startY - lastY, velocity, pageH, count);
      // Stop the browser's own momentum so it can't carry past one reel, then glide.
      el.style.overflowY = 'hidden';
      // `scroll`, not `scrollTo`: react-native-web replaces the node's scrollTo with its own
      // (x, y, animated) signature, which reads this options object as "go to 0".
      el.scroll({ top: target * pageH, behavior: 'smooth' });
      releaseTimer = setTimeout(() => {
        el.style.overflowY = '';
      }, 380);
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: true });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      if (scroller) {
        scroller.style.overflowY = '';
        scroller.style.scrollSnapType = '';
      }
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [rootRef, pageH, count, enabled]);
}
