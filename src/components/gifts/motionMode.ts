/**
 * Viewer motion setting (docs/gift-render-spec.md, "Viewer controls"). Pure.
 *
 *   full     everything as specified
 *   calm     Anchor and Stage at 50% scale, no full takeover, no particles
 *   minimal  every gift renders as a Rail card only
 */
import type { RenderMode } from './catalog';

export type GiftMotion = 'full' | 'calm' | 'minimal';

export const GIFT_MOTIONS: readonly GiftMotion[] = ['full', 'calm', 'minimal'];

export const CALM_SCALE = 0.5;
/** Host-side "cap incoming animation size" (preview stub): never bigger than this. */
export const HOST_CAP_SCALE = 0.75;

/** The mode a gift actually renders in under this setting. */
export function resolveMode(mode: RenderMode, motion: GiftMotion): RenderMode {
  if (motion === 'minimal') return 'rail';
  if (motion === 'calm' && mode === 'takeover') return 'stage'; // no full takeover
  return mode;
}

export function motionScale(motion: GiftMotion, hostCap: boolean): number {
  const base = motion === 'calm' ? CALM_SCALE : 1;
  return hostCap ? Math.min(base, HOST_CAP_SCALE) : base;
}

export function isGiftMotion(v: unknown): v is GiftMotion {
  return v === 'full' || v === 'calm' || v === 'minimal';
}
