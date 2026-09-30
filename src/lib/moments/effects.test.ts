import { describe, expect, test } from 'bun:test';

import { CAMERA_EFFECTS, applyMatrix, effectById, storedEffectId } from './effects';

describe('camera effects', () => {
  test('4-6 warm presets plus None', () => {
    const real = CAMERA_EFFECTS.filter((e) => e.id !== 'none');
    expect(real.length).toBeGreaterThanOrEqual(4);
    expect(real.length).toBeLessThanOrEqual(6);
    expect(CAMERA_EFFECTS[0]!.id).toBe('none');
  });

  test('ids fit the posts.camera_effect check (migration 016)', () => {
    for (const e of CAMERA_EFFECTS) expect(/^[a-z][a-z0-9_]{0,31}$/.test(e.id)).toBe(true);
    expect(storedEffectId('none')).toBeNull();
    expect(storedEffectId('warm')).toBe('warm');
  });

  test('matrices are 4x5, keep alpha, and stay in a sane range on white/black', () => {
    for (const e of CAMERA_EFFECTS) {
      if (!e.matrix) continue;
      expect(e.matrix.length).toBe(20);
      expect(e.matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
      for (const c of [applyMatrix(e.matrix, [1, 1, 1]), applyMatrix(e.matrix, [0, 0, 0])]) {
        for (const v of c) {
          expect(v).toBeGreaterThan(-0.05);
          expect(v).toBeLessThan(1.25);
        }
      }
    }
  });

  test('warm presets warm up neutral grey (red above blue)', () => {
    for (const id of ['warm', 'golden', 'film_grain', 'mono_warm'] as const) {
      const [r, , b] = applyMatrix(effectById(id).matrix!, [0.5, 0.5, 0.5]);
      expect(r).toBeGreaterThan(b);
    }
  });

  test('unknown ids fall back to None', () => {
    expect(effectById('beauty').id).toBe('none');
  });
});
