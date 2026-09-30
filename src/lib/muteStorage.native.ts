import { Storage } from 'expo-sqlite/kv-store';

import { storageKey } from '@/config/brand';
import { readMigrated } from '@/lib/legacyKey';

const NAME = 'muted';

/** Read the persisted mute preference, treating an unavailable store as no preference. */
export function readMuted(): boolean | null {
  try {
    const value = readMigrated(
      {
        get: (k) => Storage.getItemSync(k),
        set: (k, v) => Storage.setItemSync(k, v),
        remove: (k) => Storage.removeItemSync(k),
      },
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
    Storage.setItemSync(storageKey(NAME), muted ? '1' : '0');
  } catch (error) {
    if (__DEV__) console.warn('Unable to save mute preference', error);
  }
}
