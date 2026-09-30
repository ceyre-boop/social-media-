import type { CameraEffect } from './effects';
import type { Baked } from './bakeCore';

export type { Baked };

/** Native: Skia ships in Expo Go and dev builds; nothing to load first. */
export const effectsAvailable = true;

export async function bakeEffect(uri: string, effect: CameraEffect): Promise<Baked> {
  const { bakeWithSkia } = await import('./bakeCore');
  return bakeWithSkia(uri, effect);
}
