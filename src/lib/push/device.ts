/**
 * Web: no push. Everything reaches the person through the in-app banner (InAppNudge) instead.
 * Same surface as device.native.ts.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const pushSupported = false;

export function configurePush(): void {}

export async function permissionState(): Promise<PermissionState> {
  return 'unsupported';
}

export async function askPermission(): Promise<boolean> {
  return false;
}

export async function expoPushToken(): Promise<string | null> {
  return null;
}

export function onTokenRotation(_cb: () => void): () => void {
  return () => {};
}

export function platformName(): 'ios' | 'android' {
  return 'ios';
}
