/**
 * Push registration and the in-context permission request.
 *
 *   usePushRegistration(userId)   mount once in the signed-in shell. Registers the token only if
 *                                 permission was ALREADY granted; never prompts. Re-registers on
 *                                 token rotation.
 *   releasePushToken()            on sign-out: this phone stops receiving this account's pushes.
 *   requestPushPermission(reason) for features (first Moment prompt, first friend request). Shows
 *                                 <PushPermissionSheet> with the reason first; only a "Turn on"
 *                                 there triggers the OS prompt. Resolves true if push is on.
 *
 * Everything works with push denied or on web: the inbox + <InAppNudge> carry every notification.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

import {
  askPermission,
  configurePush,
  expoPushToken,
  onNotificationOpened,
  onTokenRotation,
  permissionState,
  platformName,
  pushSupported,
} from './device';
import { routeForNotification } from './routes';

export { pushSupported };
export type { PermissionState } from './device';

let registeredToken: string | null = null;

/** Registers this device's token for the signed-in user, if permission is already granted. */
export async function syncPushToken(): Promise<boolean> {
  if (!pushSupported) return false;
  try {
    if ((await permissionState()) !== 'granted') return false;
    const token = await expoPushToken();
    if (!token) return false;
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: platformName(),
    });
    if (error) throw error;
    registeredToken = token;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('push: registration failed', e);
    return false;
  }
}

/** Marks this device's token invalid for the current account. Call before signing out. */
export async function releasePushToken(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await supabase
      .from('devices')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('push_token', token);
  } catch {
    // Offline: the next receipt poll or weekly cleanup handles it.
  }
}

export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (!userId || !pushSupported) return;
    configurePush();
    void syncPushToken();
    return onTokenRotation(() => void syncPushToken());
  }, [userId]);
}

/**
 * Tapping a push opens the right place (routes.ts): a Moment prompt opens the camera, friend
 * notifications open Add friends. Works for the tap that launched the app too. Mount once, signed in.
 */
export function useNotificationRouting(signedIn: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!signedIn || !pushSupported) return;
    return onNotificationOpened((type) => {
      const to = routeForNotification(type);
      if (to) router.push(to as Href);
    });
  }, [signedIn, router]);
}

// ---------------------------------------------------------------- in-context permission

export type PermissionAsk = { reason: string };

let pending: (PermissionAsk & { resolve: (on: boolean) => void }) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Ask for push permission in context. `reason` is one plain sentence on why this feature wants it
 * (shown in the explainer sheet before the OS prompt). Resolves false on web, if the person says
 * "Not now", or if they have already said no in system settings.
 */
export async function requestPushPermission(reason: string): Promise<boolean> {
  if (!pushSupported) return false;
  const state = await permissionState();
  if (state === 'granted') return syncPushToken();
  if (state !== 'undetermined') return false;
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { reason, resolve };
    emit();
  });
}

/** The explainer sheet's answer. */
export async function answerPushPermission(turnOn: boolean): Promise<void> {
  const p = pending;
  pending = null;
  emit();
  if (!p) return;
  if (!turnOn) return p.resolve(false);
  const granted = await askPermission();
  p.resolve(granted ? await syncPushToken() : false);
}

export function usePendingPushPermission(): PermissionAsk | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => null,
  );
}

/** Whether pushes can currently reach this person on this device (drives the in-app banner). */
export async function pushReachable(): Promise<boolean> {
  return pushSupported && (await permissionState()) === 'granted' && registeredToken !== null;
}
