/**
 * Concurrency rules for Anchor, Stage and Takeover gifts (docs/gift-render-spec.md,
 * "Concurrency and queueing"). Pure: time is passed in, state is returned. Rail cards are not
 * scheduled here: they run concurrently with everything and are capped in rail.ts.
 *
 *  1. One Anchor, Stage or Takeover at a time.
 *  2. Higher value preempts nothing: it queues. A playing gift always finishes.
 *  3. The queue is ordered by value, then FIFO.
 *  4. Depth 8: beyond that, overflow renders as Rail cards (still fully credited).
 *  5. At most 70% of any 60s window may be occupied by Stage or Takeover; past that, the
 *     gift degrades to Rail until the window clears.
 *  6. Takeover: at most one per 60s. The rest queue.
 */
export const QUEUE_DEPTH = 8;
export const WINDOW_MS = 60_000;
export const WINDOW_CAP = 0.7;
export const TAKEOVER_GAP_MS = 60_000;

export type Lane = 'anchor' | 'stage' | 'takeover';

export type SchedItem = {
  id: number;
  lane: Lane;
  /** Value in currency units: the queue order. */
  value: number;
  durationMs: number;
};

type Waiting = SchedItem & { seq: number };
type Interval = { start: number; end: number };

export type SchedState = {
  playing: SchedItem | null;
  startedAt: number;
  waiting: Waiting[];
  /** Finished Stage/Takeover intervals (the 70% rule). */
  occupied: Interval[];
  lastTakeoverAt: number | null;
  seq: number;
};

export type SchedOut = {
  state: SchedState;
  /** Begin playing this now. */
  start: SchedItem | null;
  /** Render these as Rail cards instead (overflow or degrade). */
  rail: SchedItem[];
};

export const emptySched: SchedState = {
  playing: null,
  startedAt: 0,
  waiting: [],
  occupied: [],
  lastTakeoverAt: null,
  seq: 0,
};

const heavy = (lane: Lane) => lane === 'stage' || lane === 'takeover';

/** Milliseconds of Stage/Takeover time inside the 60s window ending at `end`. */
export function occupancy(intervals: Interval[], end: number): number {
  const from = end - WINDOW_MS;
  let total = 0;
  for (const i of intervals) {
    const overlap = Math.min(i.end, end) - Math.max(i.start, from);
    if (overlap > 0) total += overlap;
  }
  return total;
}

function byValue(a: Waiting, b: Waiting): number {
  return b.value - a.value || a.seq - b.seq;
}

/** A new gift arrives. */
export function enqueue(state: SchedState, item: SchedItem, now: number): SchedOut {
  if (state.waiting.length >= QUEUE_DEPTH) {
    return { state, start: null, rail: [item] };
  }
  const waiting = [...state.waiting, { ...item, seq: state.seq }].sort(byValue);
  return pump({ ...state, waiting, seq: state.seq + 1 }, now);
}

/** The playing gift finished (or was dismissed early, or degraded away). */
export function finish(state: SchedState, id: number, now: number): SchedOut {
  if (!state.playing || state.playing.id !== id) return { state, start: null, rail: [] };
  const occupied = heavy(state.playing.lane)
    ? [...state.occupied, { start: state.startedAt, end: now }].filter(
        (i) => i.end > now - WINDOW_MS * 2,
      )
    : state.occupied;
  return pump({ ...state, playing: null, occupied }, now);
}

function takeoverReady(state: SchedState, now: number): boolean {
  return state.lastTakeoverAt === null || now - state.lastTakeoverAt >= TAKEOVER_GAP_MS;
}

function overCap(state: SchedState, item: SchedItem, now: number): boolean {
  if (!heavy(item.lane)) return false;
  const candidate = { start: now, end: now + item.durationMs };
  return occupancy([...state.occupied, candidate], candidate.end) > WINDOW_CAP * WINDOW_MS;
}

/** Start the best eligible waiting gift if the lane is free. */
export function pump(state: SchedState, now: number): SchedOut {
  if (state.playing) return { state, start: null, rail: [] };
  const rail: SchedItem[] = [];
  const waiting = [...state.waiting];
  for (let i = 0; i < waiting.length; i++) {
    const item = waiting[i];
    if (item.lane === 'takeover' && !takeoverReady(state, now)) continue; // queues for its turn
    if (overCap(state, item, now)) {
      waiting.splice(i, 1);
      i--;
      rail.push(item);
      continue;
    }
    waiting.splice(i, 1);
    return {
      state: {
        ...state,
        waiting,
        playing: item,
        startedAt: now,
        lastTakeoverAt: item.lane === 'takeover' ? now : state.lastTakeoverAt,
      },
      start: item,
      rail,
    };
  }
  return { state: { ...state, waiting }, start: null, rail };
}

/** When to call pump() again for a waiting Takeover whose 60s gap has not passed (ms clock). */
export function nextWakeAt(state: SchedState, now: number): number | null {
  if (state.playing) return null;
  const hasTakeover = state.waiting.some((w) => w.lane === 'takeover');
  if (!hasTakeover || state.lastTakeoverAt === null) return null;
  const at = state.lastTakeoverAt + TAKEOVER_GAP_MS;
  return at > now ? at : null;
}
