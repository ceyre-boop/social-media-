/**
 * Client placement engine for anchored gifts (Mode B). Pure TypeScript: no React, no network.
 *
 * Detection runs on the creator's device and publishes samples at 10-15 Hz. Video reaches the
 * viewer 2-10s after the metadata, so a sample carries the PTS of the frame it came from. The
 * viewer buffers samples and places the sprite using the PTS of the frame it is displaying
 * NOW, interpolating between samples. See docs/gift-render-spec.md, "Mode B".
 */
import { ANCHOR_NAMES } from './types';
import type { AnchorName, AnchorPoint, AnchorSample } from './types';

export { ANCHOR_NAMES };
export type { AnchorName, AnchorPoint, AnchorSample };

/** Placement needs at least this confidence (spec fallback chain). */
export const CONFIDENCE_THRESHOLD = 0.6;
/** After tracking is lost, hold the last position this long before easing away. */
export const HOLD_MS = 400;
/** Then ease to the stage center over this long. Never snap. */
export const EASE_MS = 700;
/** Switching anchors (or regaining tracking) blends over this long so the sprite never jumps. */
export const BLEND_MS = 250;
/** A displayed PTS just outside the buffered range still uses the nearest sample this far out. */
export const EDGE_TOLERANCE_MS = 200;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// ---------------------------------------------------------------------------
// Sample buffer keyed by PTS
// ---------------------------------------------------------------------------

export class AnchorBuffer {
  private samples: AnchorSample[] = [];

  constructor(private readonly maxSpanMs = 15000) {}

  get size(): number {
    return this.samples.length;
  }
  get oldestPts(): number | null {
    return this.samples.length ? this.samples[0].pts : null;
  }
  get latestPts(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1].pts : null;
  }

  /** Insert by PTS (arrival order does not matter). A repeated PTS replaces the earlier sample. */
  push(sample: AnchorSample): void {
    const s = this.samples;
    let i = s.length;
    while (i > 0 && s[i - 1].pts > sample.pts) i--;
    if (i > 0 && s[i - 1].pts === sample.pts) s[i - 1] = sample;
    else s.splice(i, 0, sample);
    const cutoff = s[s.length - 1].pts - this.maxSpanMs;
    let drop = 0;
    while (drop < s.length - 1 && s[drop].pts < cutoff) drop++;
    if (drop > 0) s.splice(0, drop);
  }

  clear(): void {
    this.samples = [];
  }

  /** The samples on either side of `pts`: the last at or before it, the first at or after it. */
  bracket(pts: number): { before: AnchorSample | null; after: AnchorSample | null } {
    const s = this.samples;
    let lo = 0;
    let hi = s.length; // first index with pts > target
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].pts <= pts) lo = mid + 1;
      else hi = mid;
    }
    const before = lo > 0 ? s[lo - 1] : null;
    const after = before && before.pts === pts ? before : lo < s.length ? s[lo] : null;
    return { before, after };
  }
}

// ---------------------------------------------------------------------------
// Lookup and interpolation
// ---------------------------------------------------------------------------

/**
 * Where `name` was in the frame with presentation timestamp `pts`. Linear interpolation
 * between the two bracketing samples (confidence takes the lower of the two). Outside the
 * buffered range it holds the nearest sample if within EDGE_TOLERANCE_MS, else null.
 */
export function pointAt(buf: AnchorBuffer, name: AnchorName, pts: number): AnchorPoint | null {
  const { before, after } = buf.bracket(pts);
  const a = before?.[name] ?? null;
  const b = after?.[name] ?? null;
  if (before && after) {
    if (before === after) return a ? { ...a } : null;
    if (!a || !b) return null; // the detector dropped this point on one side
    const t = (pts - before.pts) / (after.pts - before.pts);
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      s: a.s + (b.s - a.s) * t,
      c: Math.min(a.c, b.c),
    };
  }
  const edge = before ?? after;
  const point = before ? a : b;
  if (!edge || !point) return null;
  return Math.abs(pts - edge.pts) <= EDGE_TOLERANCE_MS ? { ...point } : null;
}

/** First anchor of [preferred, ...fallbacks] whose interpolated confidence meets the threshold. */
export function chooseAnchor(
  buf: AnchorBuffer,
  pts: number,
  order: readonly AnchorName[],
  threshold = CONFIDENCE_THRESHOLD,
): { name: AnchorName; point: AnchorPoint } | null {
  for (const name of order) {
    const point = pointAt(buf, name, pts);
    if (point && point.c >= threshold) return { name, point };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tracker: one per anchored gift animation
// ---------------------------------------------------------------------------

export type TrackStatus = 'tracking' | 'holding' | 'easing';

export type TrackOut = {
  status: TrackStatus;
  /** Normalized frame coordinates of where to put the sprite's registration point. */
  x: number;
  y: number;
  /** Sprite scale relative to the reference body size. */
  s: number;
  /** The anchor in use (null once tracking is lost). */
  anchor: AnchorName | null;
};

type Vec = { x: number; y: number; s: number };

const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  s: a.s + (b.s - a.s) * t,
});

export type TrackerOptions = {
  preferred: AnchorName;
  fallbacks: readonly AnchorName[];
  /** Where to ease to when tracking is lost: the stage center, normalized. */
  center: { x: number; y: number };
  threshold?: number;
  holdMs?: number;
  easeMs?: number;
  blendMs?: number;
};

export class AnchorTracker {
  private readonly order: AnchorName[];
  private readonly threshold: number;
  private readonly holdMs: number;
  private readonly easeMs: number;
  private readonly blendMs: number;
  private readonly center: Vec;

  private last: Vec | null = null;
  private current: AnchorName | null = null;
  private lostAt: number | null = null;
  private heldAt: Vec | null = null;
  private blendFrom: Vec | null = null;
  private blendStart = 0;

  constructor(opts: TrackerOptions) {
    this.order = [opts.preferred, ...opts.fallbacks];
    this.threshold = opts.threshold ?? CONFIDENCE_THRESHOLD;
    this.holdMs = opts.holdMs ?? HOLD_MS;
    this.easeMs = opts.easeMs ?? EASE_MS;
    this.blendMs = opts.blendMs ?? BLEND_MS;
    this.center = { x: opts.center.x, y: opts.center.y, s: 1 };
  }

  /**
   * Try to begin tracking. Null means no anchor qualifies right now: the caller must degrade
   * the gift to Mode A (Rail) at full Glow card size.
   */
  start(buf: AnchorBuffer, pts: number): TrackOut | null {
    const pick = chooseAnchor(buf, pts, this.order, this.threshold);
    if (!pick) return null;
    this.current = pick.name;
    this.last = { x: pick.point.x, y: pick.point.y, s: pick.point.s };
    return { status: 'tracking', ...this.last, anchor: pick.name };
  }

  /** Advance one frame. `pts` is the PTS of the frame on screen; `now` is a monotonic ms clock. */
  update(buf: AnchorBuffer, pts: number, now: number): TrackOut {
    const pick = chooseAnchor(buf, pts, this.order, this.threshold);
    const previous = this.last ?? this.center;

    if (pick) {
      const target: Vec = { x: pick.point.x, y: pick.point.y, s: pick.point.s };
      const changed = this.current !== null && pick.name !== this.current;
      if (this.lostAt !== null || changed) {
        this.blendFrom = previous;
        this.blendStart = now;
      }
      this.lostAt = null;
      this.heldAt = null;
      this.current = pick.name;
      let out = target;
      if (this.blendFrom) {
        const t = (now - this.blendStart) / this.blendMs;
        if (t >= 1) this.blendFrom = null;
        else out = lerp(this.blendFrom, target, smooth(t));
      }
      this.last = out;
      return { status: 'tracking', ...out, anchor: pick.name };
    }

    // Tracking lost: hold, then ease to center. Never snap.
    if (this.lostAt === null) {
      this.lostAt = now;
      this.heldAt = previous;
      this.blendFrom = null;
    }
    const held = this.heldAt ?? previous;
    const elapsed = now - this.lostAt;
    if (elapsed <= this.holdMs) {
      this.last = held;
      return { status: 'holding', ...held, anchor: null };
    }
    const t = (elapsed - this.holdMs) / this.easeMs;
    const out = lerp(held, this.center, smooth(t));
    this.last = out;
    return { status: 'easing', ...out, anchor: null };
  }
}
