import '@/lib/storage-polyfill';

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, NativeModules, Platform } from 'react-native';

import type { Database } from '@/lib/db/types';
import { RequestTimeoutError } from '@/lib/errors';
import { setOnline } from '@/lib/network';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Dev only: a local-stack URL (127.0.0.1) means "this computer", which is wrong on a phone.
 * When the app itself was loaded from another host — a phone browser opening
 * http://<mac-ip>:8081, or Expo Go connected to the Mac's dev server — point Supabase at
 * that same host so the phone reaches the Mac's database. Production URLs are untouched.
 */
/** Host part of "exp://192.168.4.43:8081/…", "http://192.168.4.43:8081/x.bundle", or "192.168.4.43:8081". */
function hostOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\[[^\]]+\]|[^/:?#]+)/i.exec(value);
  return m?.[1];
}

/** Where this JS was loaded from on a phone: Expo Go / dev client → the Mac running Metro. */
function devServerHost(): string | undefined {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    expoGoConfig?: { debuggerHost?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string }; expoClient?: { hostUri?: string } } };
    linkingUri?: string;
  };
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  const candidates = [
    c.expoConfig?.hostUri,
    c.expoGoConfig?.debuggerHost,
    c.manifest2?.extra?.expoGo?.debuggerHost,
    c.manifest2?.extra?.expoClient?.hostUri,
    scriptURL, // the bundle URL always points at the dev server
    c.linkingUri,
  ];
  for (const candidate of candidates) {
    const host = hostOf(candidate);
    // Real network hosts only (IPs / dotted names), never scheme hosts like "expo-development-client".
    if (host && !LOOPBACK.has(host) && (host.includes('.') || host.startsWith('['))) return host;
  }
  return undefined;
}

function devReachableUrl(url: string): string {
  if (!__DEV__) return url;
  // String surgery, not `new URL()`: React Native's URL polyfill can't read/set hostname.
  const m = /^(https?:\/\/)(\[[^\]]+\]|[^/:]+)(.*)$/i.exec(url);
  if (!m || !LOOPBACK.has(m[2])) return url;
  const host =
    Platform.OS === 'web'
      ? typeof window !== 'undefined'
        ? window.location.hostname
        : undefined
      : devServerHost();
  if (!host || LOOPBACK.has(host)) return url;
  return `${m[1]}${host}${m[3]}`.replace(/\/$/, '');
}

/** True when the env vars are missing. The root layout shows a config screen instead of crashing. */
export const configMissing = !rawUrl || !rawKey;
export const supabaseUrl = devReachableUrl(rawUrl ?? '');

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
  supabaseUrl || 'http://config-missing.invalid',
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
