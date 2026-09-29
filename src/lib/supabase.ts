import '@/lib/storage-polyfill';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/lib/db/types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. See .env.example.');
}

// Static web export renders in Node, where there is no real localStorage (Node 25 exposes a
// broken stub). Use a throwaway in-memory store there; the browser and native get real storage.
const isServerRender = typeof window === 'undefined';
const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
};

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: isServerRender
      ? memoryStorage
      : Platform.OS === 'web'
        ? undefined // supabase-js falls back to the browser localStorage
        : globalThis.localStorage,
    autoRefreshToken: !isServerRender,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is foregrounded (native only).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
