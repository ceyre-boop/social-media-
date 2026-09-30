import { useCallback, useState } from 'react';

import { storageKey } from '@/config/brand';
import { readMigrated } from '@/lib/legacyKey';
import { useReducedMotion } from '@/lib/theme';

import { isGiftMotion } from './motionMode';
import type { GiftMotion } from './motionMode';

const NAME = 'giftMotion';

type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
};
const kv = (): KV | undefined => (globalThis as { localStorage?: KV }).localStorage;

function read(): GiftMotion | null {
  try {
    const s = kv();
    if (!s) return null;
    const v = readMigrated(
      {
        get: (k) => s.getItem(k),
        set: (k, x) => s.setItem(k, x),
        remove: (k) => s.removeItem?.(k),
      },
      NAME,
    );
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
      kv()?.setItem(storageKey(NAME), m);
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
  }, []);
  return [stored ?? (reduce ? 'calm' : 'full'), set];
}
