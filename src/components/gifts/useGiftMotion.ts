import { useCallback, useState } from 'react';

import { useReducedMotion } from '@/lib/theme';

import { isGiftMotion } from './motionMode';
import type { GiftMotion } from './motionMode';

const KEY = 'smiley.giftMotion';

type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const kv = (): KV | undefined => (globalThis as { localStorage?: KV }).localStorage;

function read(): GiftMotion | null {
  try {
    const v = kv()?.getItem(KEY);
    return isGiftMotion(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The viewer's gift motion setting, remembered per device. With nothing saved it follows the
 * OS: reduced motion defaults to Calm, everything else to Full. An explicit choice always wins.
 */
export function useGiftMotion(): [GiftMotion, (m: GiftMotion) => void] {
  const reduce = useReducedMotion();
  const [stored, setStored] = useState<GiftMotion | null>(read);
  const set = useCallback((m: GiftMotion) => {
    setStored(m);
    try {
      kv()?.setItem(KEY, m);
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
  }, []);
  return [stored ?? (reduce ? 'calm' : 'full'), set];
}
