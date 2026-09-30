import { Storage } from 'expo-sqlite/kv-store';

const STORAGE_KEY = 'smiley.muted';

/** Read the persisted mute preference, treating an unavailable store as no preference. */
export function readMuted(): boolean | null {
  try {
    const value = Storage.getItemSync(STORAGE_KEY);
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
    Storage.setItemSync(STORAGE_KEY, muted ? '1' : '0');
  } catch (error) {
    if (__DEV__) console.warn('Unable to save mute preference', error);
  }
}
