/**
 * camera_effects presets for Moments: warm colour and grain treatments, baked into the saved JPEG.
 * Not beauty filters: nothing here detects, smooths or reshapes a face. Every preset is a single
 * 4x5 colour matrix over the whole photo, optionally plus uniform film grain.
 *
 * Matrices are row-major [r g b a translate] x 4, translate normalised to 0..1 (Skia's convention).
 * Pure data (no Skia import), so it is unit-tested and safe to load anywhere.
 */

export type CameraEffectId = 'none' | 'warm' | 'golden' | 'film_grain' | 'soft_fade' | 'mono_warm';

export type CameraEffect = {
  id: CameraEffectId;
  label: string;
  /** null = leave colour alone. */
  matrix: number[] | null;
  /** Grain strength 0..1 (0 = none). */
  grain: number;
};

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Per-channel scale + lift (a warm tint). */
function tint(r: number, g: number, b: number, lift = 0): number[] {
  return [r, 0, 0, 0, lift, 0, g, 0, 0, lift, 0, 0, b, 0, lift * 0.6, 0, 0, 0, 1, 0];
}

/** Lower contrast around mid-grey and lift the blacks. */
function fade(amount: number, warmth: number): number[] {
  const c = 1 - amount;
  const t = amount / 2;
  return [c, 0, 0, 0, t + warmth, 0, c, 0, 0, t, 0, 0, c, 0, t - warmth, 0, 0, 0, 1, 0];
}

/** Luminance to a warm monochrome (not sepia-brown: a soft paper tone). */
function monoWarm(): number[] {
  const [lr, lg, lb] = [0.2126, 0.7152, 0.0722];
  const row = (k: number, lift: number) => [lr * k, lg * k, lb * k, 0, lift];
  return [...row(1.06, 0.03), ...row(1.0, 0.02), ...row(0.88, 0.0), 0, 0, 0, 1, 0];
}

export const CAMERA_EFFECTS: CameraEffect[] = [
  { id: 'none', label: 'None', matrix: null, grain: 0 },
  { id: 'warm', label: 'Warm', matrix: tint(1.07, 1.01, 0.9, 0.01), grain: 0 },
  { id: 'golden', label: 'Golden', matrix: tint(1.1, 1.04, 0.8, 0.03), grain: 0 },
  { id: 'film_grain', label: 'Film grain', matrix: tint(1.04, 1.0, 0.94, 0.02), grain: 0.5 },
  { id: 'soft_fade', label: 'Soft fade', matrix: fade(0.16, 0.015), grain: 0 },
  { id: 'mono_warm', label: 'Mono warm', matrix: monoWarm(), grain: 0.25 },
];

export function effectById(id: string | null | undefined): CameraEffect {
  return CAMERA_EFFECTS.find((e) => e.id === id) ?? CAMERA_EFFECTS[0]!;
}

/** What posts.camera_effect stores: null for none. */
export function storedEffectId(id: CameraEffectId): string | null {
  return id === 'none' ? null : id;
}

/** Applies a matrix to one RGB colour in 0..1 (used by tests to sanity-check presets). */
export function applyMatrix(m: number[], [r, g, b]: [number, number, number]): [number, number, number] {
  const ch = (i: number) => m[i * 5]! * r + m[i * 5 + 1]! * g + m[i * 5 + 2]! * b + m[i * 5 + 4]!;
  return [ch(0), ch(1), ch(2)];
}

export { IDENTITY as IDENTITY_MATRIX };

/** SkSL: uniform-ish film grain (hash noise), blended over the photo at `strength`. */
export const GRAIN_SKSL = `
uniform float seed;
half4 main(float2 p) {
  float n = fract(sin(dot(floor(p) + seed, float2(12.9898, 78.233))) * 43758.5453);
  return half4(half3(n), 1.0);
}`;
