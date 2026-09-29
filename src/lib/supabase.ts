import '@/lib/storage-polyfill';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/lib/db/types';
import { RequestTimeoutError } from '@/lib/errors';
import { setOnline } from '@/lib/network';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when the env vars are missing. The root layout shows a config screen instead of crashing. */
export const configMissing = !rawUrl || !rawKey;
export const supabaseUrl = rawUrl ?? '';

const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

/** fetch that never hangs: aborts after a time budget and reports reachability. */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const budget =
    method !== 'GET' && url.includes('/storage/v1/object/') ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, budget);
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    setOnline(true);
    return res;
  } catch (e) {
    if (timedOut) {
      setOnline(false);
      throw new RequestTimeoutError();
    }
    if (!caller?.aborted) setOnline(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

// Static web export renders in Node, where there is no real localStorage (Node 25 exposes a
// broken stub). Use a throwaway in-memory store there; the browser and native get real storage.
const isServerRender = typeof window === 'undefined';
const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
};

// With missing config we still build a (never-used) client so imports stay safe.
export const supabase = createClient<Database>(
  rawUrl ?? 'http://config-missing.invalid',
  rawKey ?? 'config-missing',
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      storage: isServerRender
        ? memoryStorage
        : Platform.OS === 'web'
          ? undefined // supabase-js falls back to the browser localStorage
          : globalThis.localStorage,
      autoRefreshToken: !isServerRender && !configMissing,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/** Resolves true when the auth server answers at all (any HTTP response counts). */
export async function pingServer(): Promise<boolean> {
  if (configMissing) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      signal: controller.signal,
      headers: { apikey: rawKey! },
    });
    setOnline(true);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Only refresh tokens while the app is foregrounded (native only).
if (Platform.OS !== 'web' && !configMissing) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
