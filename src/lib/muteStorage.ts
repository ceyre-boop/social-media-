import { storageKey } from '@/config/brand';
import { readMigrated } from '@/lib/legacyKey';

const NAME = 'muted';

/** Read the persisted mute preference when browser storage is available. */
export function readMuted(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const ls = globalThis.localStorage;
    const value = readMigrated(
      { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) },
      NAME,
    );
    if (value === '1') return true;
    if (value === '0') return false;
    return null;
  } catch (error) {
    if (__DEV__) console.warn('Unable to read mute preference', error);
    return null;
  }
}

/** Persist the mute preference without making storage availability a runtime dependency. */
export function writeMuted(muted: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    globalThis.localStorage.setItem(storageKey(NAME), muted ? '1' : '0');
  } catch (error) {
    if (__DEV__) console.warn('Unable to save mute preference', error);
  }
}
