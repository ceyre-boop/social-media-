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

/** Recent search queries (web localStorage). Unavailable storage reads as empty. */
export function readRecents(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const ls = globalThis.localStorage;
    return parse(
      readMigrated(
        { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) },
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
    if (typeof localStorage === 'undefined') return;
    globalThis.localStorage.setItem(storageKey(NAME), JSON.stringify(list));
  } catch (error) {
    if (__DEV__) console.warn('Unable to save recent searches', error);
  }
}
