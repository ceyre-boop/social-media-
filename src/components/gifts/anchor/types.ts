/** Anchor points on a creator's body, as published by the broadcaster (docs/gift-render-spec.md). */
export type AnchorName = 'crown' | 'face' | 'chest' | 'hands' | 'shoulder_l' | 'shoulder_r';

export const ANCHOR_NAMES: readonly AnchorName[] = [
  'crown',
  'face',
  'chest',
  'hands',
  'shoulder_l',
  'shoulder_r',
];

/** x/y normalized 0-1 in the video frame; s scale vs a reference body size; c confidence 0-1. */
export type AnchorPoint = { x: number; y: number; s: number; c: number };

/**
 * One metadata sample. `pts` is the presentation timestamp (ms) of the video frame the
 * coordinates were computed from, NOT the time the sample arrived.
 */
export type AnchorSample = { pts: number } & Partial<Record<AnchorName, AnchorPoint>>;
