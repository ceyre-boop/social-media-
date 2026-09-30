import { Storage } from 'expo-sqlite/kv-store';

import { storageKey } from '@/config/brand';
import { readMigrated } from '@/lib/legacyKey';

const NAME = 'recentSearches';

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Recent search queries (native key-value store). Unavailable storage reads as empty. */
export function readRecents(): string[] {
  try {
    return parse(
      readMigrated(
        {
          get: (k) => Storage.getItemSync(k),
          set: (k, v) => Storage.setItemSync(k, v),
          remove: (k) => Storage.removeItemSync(k),
        },
        NAME,
      ),
    );
  } catch (error) {
    if (__DEV__) console.warn('Unable to read recent searches', error);
    return [];
  }
}

export function writeRecents(list: string[]): void {
  try {
    Storage.setItemSync(storageKey(NAME), JSON.stringify(list));
  } catch (error) {
    if (__DEV__) console.warn('Unable to save recent searches', error);
  }
}
