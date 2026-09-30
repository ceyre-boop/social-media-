import { brand, storageKey } from '@/config/brand';

/** Pre-rename persisted-key prefix. Read once as a fallback and migrated to `storageKey(name)`. */
const LEGACY_PREFIX = brand.legacyStoragePrefix;

/** Legacy key for a name, e.g. the key used before the neutral storage prefix. */
export function legacyStorageKey(name: string): string {
  return `${LEGACY_PREFIX}.${name}`;
}

export type KeyValue = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove?(key: string): void;
};

/**
 * Read `storageKey(name)`; if absent, read the legacy key once, copy it to the new key and drop
 * the legacy one so existing users keep their preferences.
 */
export function readMigrated(kv: KeyValue, name: string): string | null {
  const next = storageKey(name);
  const current = kv.get(next);
  if (current !== null && current !== undefined) return current;
  const legacy = legacyStorageKey(name);
  const old = kv.get(legacy);
  if (old === null || old === undefined) return null;
  kv.set(next, old);
  kv.remove?.(legacy);
  return old;
}
