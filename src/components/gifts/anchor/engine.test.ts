import { describe, expect, test } from 'bun:test';

import {
  AnchorBuffer,
  AnchorTracker,
  BLEND_MS,
  EASE_MS,
  EDGE_TOLERANCE_MS,
  HOLD_MS,
  chooseAnchor,
  pointAt,
} from './engine';
import type { AnchorName, AnchorSample } from './engine';

const p = (x: number, y: number, c = 0.9, s = 1) => ({ x, y, s, c });

/** A straight-line mover sampled at ~12 Hz: x = pts/10000 (so x at pts 5000 is 0.5). */
function line(from: number, to: number, step = 80, c = 0.9): AnchorSample[] {
  const out: AnchorSample[] = [];
  for (let t = from; t <= to; t += step) {
    out.push({ pts: t, crown: p(t / 10000, 0.2, c), chest: p(t / 10000, 0.5, c) });
  }
  return out;
}

function filled(from: number, to: number, c = 0.9) {
  const buf = new AnchorBuffer();
  line(from, to, 80, c).forEach((s) => buf.push(s));
  return buf;
}

describe('AnchorBuffer', () => {
  test('keeps samples sorted by PTS even when they arrive out of order', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 300, crown: p(0.3, 0.2) });
    buf.push({ pts: 100, crown: p(0.1, 0.2) });
    buf.push({ pts: 200, crown: p(0.2, 0.2) });
    expect(buf.oldestPts).toBe(100);
    expect(buf.latestPts).toBe(300);
    expect(buf.bracket(150).before?.pts).toBe(100);
    expect(buf.bracket(150).after?.pts).toBe(200);
  });

  test('a repeated PTS replaces the earlier sample', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 100, crown: p(0.1, 0.2) });
    buf.push({ pts: 100, crown: p(0.9, 0.2) });
    expect(buf.size).toBe(1);
    expect(pointAt(buf, 'crown', 100)?.x).toBe(0.9);
  });

  test('bracket at an exact PTS returns that sample on both sides', () => {
    const buf = filled(0, 1000);
    const b = buf.bracket(400);
    expect(b.before?.pts).toBe(400);
    expect(b.after?.pts).toBe(400);
  });

  test('prunes samples older than the max span behind the newest', () => {
    const buf = new AnchorBuffer(1000);
    for (let t = 0; t <= 3000; t += 100) buf.push({ pts: t, crown: p(0.5, 0.5) });
    expect(buf.oldestPts).toBe(2000);
    expect(buf.latestPts).toBe(3000);
  });
});

describe('PTS matching', () => {
  test('placing at the displayed frame PTS gives where the creator WAS, not the latest sample', () => {
    // Metadata is 3s ahead of the video: newest sample is pts 10000, screen shows pts 7000.
    const buf = filled(0, 10000);
    const displayed = 10000 - 3000;
    const atDisplayed = pointAt(buf, 'crown', displayed)!;
    const latest = pointAt(buf, 'crown', 10000)!;
    expect(atDisplayed.x).toBeCloseTo(0.7, 3);
    expect(latest.x).toBeCloseTo(1.0, 3);
    expect(Math.abs(latest.x - atDisplayed.x)).toBeGreaterThan(0.25); // naive placement would drift this far
  });
});

describe('interpolation', () => {
  test('linear between the bracketing samples', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 1000, chest: p(0.2, 0.4, 0.9, 1.0) });
    buf.push({ pts: 1100, chest: p(0.4, 0.6, 0.8, 1.2) });
    const mid = pointAt(buf, 'chest', 1050)!;
    expect(mid.x).toBeCloseTo(0.3, 6);
    expect(mid.y).toBeCloseTo(0.5, 6);
    expect(mid.s).toBeCloseTo(1.1, 6);
    expect(mid.c).toBeCloseTo(0.8, 6); // the lower confidence wins
  });

  test('a point missing from one side is treated as lost', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 1000, chest: p(0.2, 0.4) });
    buf.push({ pts: 1100, crown: p(0.4, 0.6) });
    expect(pointAt(buf, 'chest', 1050)).toBeNull();
  });

  test('just outside the buffer holds the nearest sample; far outside is unavailable', () => {
    const buf = filled(1000, 2000);
    expect(pointAt(buf, 'crown', 1000 - EDGE_TOLERANCE_MS + 1)).toBeTruthy();
    expect(pointAt(buf, 'crown', 1000 - EDGE_TOLERANCE_MS - 50)).toBeNull();
    expect(pointAt(buf, 'crown', 2000 + EDGE_TOLERANCE_MS + 50)).toBeNull();
  });
});

describe('fallback chain', () => {
  const order: AnchorName[] = ['hands', 'chest', 'shoulder_r'];

  test('uses the preferred anchor when its confidence is at least 0.6', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 1000, hands: p(0.6, 0.6, 0.6), chest: p(0.5, 0.5, 0.95) });
    expect(chooseAnchor(buf, 1000, order)?.name).toBe('hands');
  });

  test('falls to the next anchor that meets the threshold, in order', () => {
    const buf = new AnchorBuffer();
    buf.push({
      pts: 1000,
      hands: p(0.6, 0.6, 0.59),
      chest: p(0.5, 0.5, 0.7),
      shoulder_r: p(0.6, 0.4, 0.95),
    });
    expect(chooseAnchor(buf, 1000, order)?.name).toBe('chest');
    const buf2 = new AnchorBuffer();
    buf2.push({
      pts: 1000,
      hands: p(0.6, 0.6, 0.2),
      chest: p(0.5, 0.5, 0.3),
      shoulder_r: p(0.6, 0.4, 0.95),
    });
    expect(chooseAnchor(buf2, 1000, order)?.name).toBe('shoulder_r');
  });

  test('null when nothing qualifies', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 1000, hands: p(0.6, 0.6, 0.2), chest: p(0.5, 0.5, 0.3) });
    expect(chooseAnchor(buf, 1000, order)).toBeNull();
  });
});

describe('AnchorTracker', () => {
  const center = { x: 0.5, y: 0.43 };
  const mk = () => new AnchorTracker({ preferred: 'crown', fallbacks: ['chest'], center });

  test('degrades (start returns null) when no anchor is usable, so the caller can fall back to the rail', () => {
    expect(mk().start(new AnchorBuffer(), 1000)).toBeNull();
    expect(mk().start(filled(0, 2000, 0.3), 1000)).toBeNull();
  });

  test('tracks the displayed PTS and passes the scale through', () => {
    const buf = new AnchorBuffer();
    buf.push({ pts: 1000, crown: p(0.3, 0.2, 0.9, 1.0) });
    buf.push({ pts: 1100, crown: p(0.4, 0.2, 0.9, 1.4) });
    const t = mk();
    expect(t.start(buf, 1000)?.anchor).toBe('crown');
    const out = t.update(buf, 1050, 0);
    expect(out.status).toBe('tracking');
    expect(out.x).toBeCloseTo(0.35, 6);
    expect(out.s).toBeCloseTo(1.2, 6);
  });

  test('losing tracking holds the last position for 400ms', () => {
    const buf = filled(0, 4000);
    const t = mk();
    t.start(buf, 1000);
    const before = t.update(buf, 1000, 0);
    // The displayed PTS moves past the buffer: no data, so tracking is lost.
    const lostPts = 4000 + EDGE_TOLERANCE_MS + 500;
    const first = t.update(buf, lostPts, 16);
    expect(first.status).toBe('holding');
    expect(first.x).toBe(before.x);
    const late = t.update(buf, lostPts, 16 + HOLD_MS - 1);
    expect(late.status).toBe('holding');
    expect(late.x).toBe(before.x);
    expect(late.y).toBe(before.y);
  });

  test('after the hold it eases to the stage center, monotonic, never jumping, and lands there', () => {
    const buf = filled(0, 4000);
    const t = mk();
    t.start(buf, 3900);
    const start = t.update(buf, 3900, 0);
    const lostPts = 9000;
    let prev = { x: start.x, y: start.y };
    let maxStep = 0;
    let lastOut = start;
    let sawEasing = false;
    for (let now = 16; now <= HOLD_MS + EASE_MS + 100; now += 16) {
      const out = t.update(buf, lostPts, now);
      maxStep = Math.max(maxStep, Math.hypot(out.x - prev.x, out.y - prev.y));
      if (out.status === 'easing') sawEasing = true;
      prev = { x: out.x, y: out.y };
      lastOut = out;
    }
    expect(sawEasing).toBe(true);
    expect(lastOut.x).toBeCloseTo(center.x, 6);
    expect(lastOut.y).toBeCloseTo(center.y, 6);
    expect(lastOut.s).toBeCloseTo(1, 6);
    // Distance to travel is well under 1; at 16ms steps no single frame may move more than 5% of it.
    const total = Math.hypot(center.x - start.x, center.y - start.y);
    expect(maxStep).toBeLessThan(total * 0.05);
  });

  test('regaining tracking blends from where the sprite was instead of jumping', () => {
    const buf = new AnchorBuffer();
    line(0, 1000).forEach((s) => buf.push(s)); // data for 0..1000 only
    const t = mk();
    t.start(buf, 500);
    t.update(buf, 500, 0);
    const held = t.update(buf, 5000, 100); // lost
    expect(held.status).toBe('holding');
    // Data returns somewhere far away (x ~ 0.9).
    for (let ts = 4900; ts <= 5400; ts += 80)
      buf.push({ pts: ts, crown: p(0.9, 0.2), chest: p(0.9, 0.5) });
    const back = t.update(buf, 5000, 200);
    expect(back.status).toBe('tracking');
    expect(Math.abs(back.x - held.x)).toBeLessThan(0.05); // starts from the held position
    const done = t.update(buf, 5000, 200 + BLEND_MS + 10);
    expect(done.x).toBeCloseTo(0.9, 3);
  });

  test('switching to a fallback anchor blends rather than snapping', () => {
    const buf = new AnchorBuffer();
    for (let ts = 0; ts <= 2000; ts += 80) {
      buf.push({ pts: ts, crown: p(0.5, 0.2, ts < 1000 ? 0.9 : 0.2), chest: p(0.5, 0.6, 0.9) });
    }
    const t = mk();
    t.start(buf, 0);
    t.update(buf, 900, 0);
    const a = t.update(buf, 1200, 16); // crown now below threshold: falls back to chest
    expect(a.anchor).toBe('chest');
    expect(a.y).toBeLessThan(0.3); // still near the crown at first
    const b = t.update(buf, 1200, 16 + BLEND_MS + 10);
    expect(b.y).toBeCloseTo(0.6, 3);
  });
});
