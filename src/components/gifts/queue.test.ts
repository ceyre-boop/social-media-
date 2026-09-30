import { describe, expect, test } from 'bun:test';

import {
  QUEUE_DEPTH,
  TAKEOVER_GAP_MS,
  WINDOW_MS,
  emptySched,
  enqueue,
  finish,
  nextWakeAt,
  occupancy,
} from './queue';
import type { Lane, SchedItem, SchedOut, SchedState } from './queue';

let n = 0;
const item = (lane: Lane, blips: number, durationMs = 3000): SchedItem => ({
  id: ++n,
  lane,
  blips,
  durationMs,
});

function run(state: SchedState, ...ops: ((s: SchedState) => SchedOut)[]) {
  let s = state;
  const started: number[] = [];
  const rail: number[] = [];
  for (const op of ops) {
    const out = op(s);
    s = out.state;
    if (out.start) started.push(out.start.id);
    out.rail.forEach((r) => rail.push(r.id));
  }
  return { s, started, rail };
}

describe('one at a time, preempt nothing', () => {
  test('the first gift starts; later ones wait', () => {
    const a = item('stage', 600);
    const b = item('anchor', 200);
    const r = run(
      emptySched,
      (s) => enqueue(s, a, 0),
      (s) => enqueue(s, b, 10),
    );
    expect(r.started).toEqual([a.id]);
    expect(r.s.playing?.id).toBe(a.id);
    expect(r.s.waiting.length).toBe(1);
  });

  test('a higher-value gift never preempts what is playing', () => {
    const small = item('anchor', 100);
    const big = item('takeover', 10000, 6000);
    const r = run(
      emptySched,
      (s) => enqueue(s, small, 0),
      (s) => enqueue(s, big, 5),
    );
    expect(r.s.playing?.id).toBe(small.id);
    expect(r.started).toEqual([small.id]);
  });
});

describe('ordering', () => {
  test('the queue is value-ordered, then FIFO within equal value', () => {
    const first = item('stage', 500);
    const low1 = item('anchor', 100);
    const high = item('stage', 2000);
    const low2 = item('anchor', 100);
    const mid = item('stage', 900);
    let s = enqueue(emptySched, first, 0).state;
    for (const it of [low1, high, low2, mid]) s = enqueue(s, it, 1).state;
    expect(s.waiting.map((w) => w.id)).toEqual([high.id, mid.id, low1.id, low2.id]);
    // Finishing plays them in that order.
    const order: number[] = [];
    let t = 3000;
    let out = finish(s, first.id, t);
    while (out.start) {
      order.push(out.start.id);
      t += out.start.durationMs;
      out = finish(out.state, out.start.id, t);
    }
    expect(order).toEqual([high.id, mid.id, low1.id, low2.id]);
  });
});

describe('depth 8', () => {
  test('beyond eight waiting, overflow goes to the rail', () => {
    const playing = item('anchor', 100, 2400);
    let s = enqueue(emptySched, playing, 0).state;
    for (let i = 0; i < QUEUE_DEPTH; i++) s = enqueue(s, item('anchor', 100 + i, 2400), 1).state;
    expect(s.waiting.length).toBe(QUEUE_DEPTH);
    const over = item('anchor', 400, 2400);
    const out = enqueue(s, over, 2);
    expect(out.rail.map((r) => r.id)).toEqual([over.id]);
    expect(out.state.waiting.length).toBe(QUEUE_DEPTH);
  });
});

describe('70% window cap', () => {
  test('occupancy counts only the part inside the rolling window', () => {
    expect(occupancy([{ start: 0, end: 4000 }], 4000)).toBe(4000);
    expect(occupancy([{ start: 0, end: 4000 }], WINDOW_MS + 1000)).toBe(3000);
    expect(occupancy([{ start: 0, end: 4000 }], WINDOW_MS + 4000)).toBe(0);
  });

  test('stage gifts past 42s in a 60s window degrade to rail until the window clears', () => {
    // Ten 4s stage gifts back to back = 40s of occupancy. The 11th would make 44s > 42s.
    let s = emptySched;
    let t = 0;
    for (let i = 0; i < 10; i++) {
      const it = item('stage', 5000, 4000);
      const out = enqueue(s, it, t);
      expect(out.start?.id).toBe(it.id);
      t += 4000;
      s = finish(out.state, it.id, t).state;
    }
    const extra = item('stage', 5000, 4000);
    const out = enqueue(s, extra, t);
    expect(out.start).toBeNull();
    expect(out.rail.map((r) => r.id)).toEqual([extra.id]);
    // Once the window has cleared (>60s after those plays), stage plays again.
    const later = item('stage', 5000, 4000);
    const ok = enqueue(out.state, later, t + WINDOW_MS);
    expect(ok.start?.id).toBe(later.id);
  });

  test('anchor gifts do not count toward the cap', () => {
    let s = emptySched;
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const it = item('anchor', 200, 2800);
      const out = enqueue(s, it, t);
      expect(out.start?.id).toBe(it.id);
      t += 2800;
      s = finish(out.state, it.id, t).state;
    }
    expect(s.occupied.length).toBe(0);
  });
});

describe('takeover: one per 60s, overflow queues', () => {
  test('a second takeover waits for its turn and other gifts play meanwhile', () => {
    const t1 = item('takeover', 10000, 6000);
    let out = enqueue(emptySched, t1, 0);
    expect(out.start?.id).toBe(t1.id);
    const t2 = item('takeover', 10000, 6000);
    out = enqueue(out.state, t2, 100);
    expect(out.start).toBeNull();
    const glow = item('anchor', 300, 2800);
    out = enqueue(out.state, glow, 200);
    out = finish(out.state, t1.id, 6000);
    // The takeover is not eligible yet, so the glow plays.
    expect(out.start?.id).toBe(glow.id);
    out = finish(out.state, glow.id, 8800);
    expect(out.start).toBeNull();
    expect(out.state.waiting.map((w) => w.id)).toEqual([t2.id]);
    expect(nextWakeAt(out.state, 8800)).toBe(TAKEOVER_GAP_MS);
    // At 60s it starts.
    const wake = enqueue(out.state, item('anchor', 100, 2400), TAKEOVER_GAP_MS);
    expect(wake.start?.id).toBe(t2.id);
  });
});

describe('finish', () => {
  test('finishing an id that is not playing changes nothing', () => {
    const a = item('stage', 600);
    const s = enqueue(emptySched, a, 0).state;
    const out = finish(s, 999999, 10);
    expect(out.state).toBe(s);
    expect(out.start).toBeNull();
  });
});
