import { r2Store } from './r2Store';
import { supabaseStore } from './supabaseStore';
import type { MediaStore } from './types';

export type { MediaStore, UploadOptions } from './types';
export { MediaStoreError, UploadAbortedError } from './types';

export type MediaProvider = 'supabase' | 'r2';

const configuredProvider = process.env.EXPO_PUBLIC_MEDIA_PROVIDER ?? 'supabase';
if (configuredProvider !== 'supabase' && configuredProvider !== 'r2') {
  throw new Error(
    `Invalid EXPO_PUBLIC_MEDIA_PROVIDER "${configuredProvider}". Allowed values: supabase, r2.`,
  );
}

export const mediaProvider: MediaProvider = configuredProvider;
export const mediaStore: MediaStore = mediaProvider === 'r2' ? r2Store : supabaseStore;
