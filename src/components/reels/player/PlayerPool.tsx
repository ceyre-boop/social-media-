/**
 * PlayerPool: exactly POOL_SIZE expo-video players, created once per feed and never per item.
 *
 * Pages borrow a slot by reel key (post id). On every settled swipe the feed calls `settle()`
 * with the current reel and its neighbours (index ± 1):
 *   - slots already holding a wanted key keep it (no reload),
 *   - missing keys take the least-recently-used free slot and swap source via `replaceAsync`
 *     (the VideoView is never remounted for a source change of the same page),
 *   - the current slot plays (looping, never auto-advancing),
 *   - neighbours are held paused on their first frame (decode-ahead),
 *   - every other slot is paused.
 *
 * Pages subscribe per key with `usePooledPlayer(key)`; the snapshot is a primitive string, so a
 * settle re-renders only the pages whose slot, current-ness or paused state actually changed.
 */
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { autoplayBlocked, getMuted, subscribeMuted } from '@/lib/mute';

export const POOL_SIZE = 4;

export type ReelSource = { key: string; uri: string };

/** Why playback is suspended. Any active reason pauses every player. */
export type SuspendReason = 'blur' | 'background' | 'hidden';

type Slot = {
  key: string | null;
  uri: string | null;
  /** Monotonic token: a replaceAsync that resolves after a newer assignment is ignored. */
  token: number;
  /** The key whose source finished loading in this slot. */
  loadedKey: string | null;
  /** The key whose first frame has been drawn by a mounted VideoView. */
  firstFrameKey: string | null;
  /** This slot has been the playing current reel since it was last rewound. */
  wasCurrent: boolean;
  lastUsed: number;
};

/** Dev-only record of one settle, read by the web walk to verify decode-ahead. */
export type SettleRecord = {
  key: string | null;
  at: number;
  /** The reel was already loaded in a slot when it became current. */
  preloaded: boolean;
  /** Its first frame had already been drawn (poster → video with no wait). */
  preDecoded: boolean;
  /** ms from settle until its first frame was drawn (0 when preDecoded). */
  firstFrameMs: number | null;
};

export class PoolStore {
  private players: VideoPlayer[] = [];
  private slots: Slot[] = Array.from({ length: POOL_SIZE }, () => ({
    key: null,
    uri: null,
    token: 0,
    loadedKey: null,
    firstFrameKey: null,
    wasCurrent: false,
    lastUsed: 0,
  }));
  private currentKey: string | null = null;
  private userPaused = false;
  private suspended = new Set<SuspendReason>();
  private listeners = new Set<() => void>();
  private clock = 0;
  readonly settles: SettleRecord[] = [];
  /** Set by the feed: a slot could not load its source (e.g. expired signed URL). */
  onLoadFailed: ((key: string) => void) | null = null;

  attach(players: VideoPlayer[]): void {
    this.players = players;
    const muted = getMuted();
    for (const p of players) p.muted = muted;
  }

  setMuted(muted: boolean): void {
    // Direct property writes: no React render involved.
    for (const p of this.players) p.muted = muted;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Primitive snapshot for one key: "slot|current|paused|loaded|drawn". */
  snapshot(key: string): string {
    const slot = this.slots.findIndex((s) => s.key === key);
    if (slot < 0) return '-1|0|0|0|0';
    const current = key === this.currentKey;
    const loaded = this.slots[slot].loadedKey === key;
    const drawn = this.slots[slot].firstFrameKey === key;
    return `${slot}|${current ? 1 : 0}|${current && this.userPaused ? 1 : 0}|${loaded ? 1 : 0}|${drawn ? 1 : 0}`;
  }

  player(slot: number): VideoPlayer | null {
    return this.players[slot] ?? null;
  }

  /** Assign slots for the settled page. `current` may be null (image/text/end page). */
  settle(current: ReelSource | null, neighbours: ReelSource[]): void {
    if (this.players.length < POOL_SIZE) return;
    const wanted: ReelSource[] = [];
    if (current) wanted.push(current);
    for (const n of neighbours) {
      if (!wanted.some((w) => w.key === n.key)) wanted.push(n);
    }
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const prevCurrent = this.currentKey;
    this.currentKey = current?.key ?? null;
    if (prevCurrent !== this.currentKey) this.userPaused = false;

    for (const src of wanted) {
      const i = this.slots.findIndex((s) => s.key === src.key);
      // Identity is the post key alone: a re-signed URL for the same reel never reloads its slot.
      if (i >= 0) {
        this.slots[i].lastUsed = ++this.clock;
        continue;
      }
      const target = i >= 0 ? i : this.pickFreeSlot(wantedKeys);
      this.load(target, src);
    }

    if (__DEV__ && current && prevCurrent !== current.key) {
      const slot = this.slots.find((s) => s.key === current.key);
      const preDecoded = slot?.firstFrameKey === current.key;
      this.settles.push({
        key: current.key,
        at: Date.now(),
        preloaded: slot?.loadedKey === current.key,
        preDecoded,
        firstFrameMs: preDecoded ? 0 : null,
      });
    }

    this.applyPlayback();
    this.emit();
  }

  /** LRU among slots that hold nothing wanted right now. */
  private pickFreeSlot(wantedKeys: Set<string>): number {
    let best = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.key && wantedKeys.has(s.key)) continue;
      if (best < 0 || s.lastUsed < this.slots[best].lastUsed) best = i;
    }
    if (best < 0) throw new Error('PlayerPool: more wanted reels than slots');
    return best;
  }

  private load(i: number, src: ReelSource): void {
    const slot = this.slots[i];
    const player = this.players[i];
    slot.key = src.key;
    slot.uri = src.uri;
    slot.loadedKey = null;
    slot.firstFrameKey = null;
    slot.wasCurrent = false;
    slot.lastUsed = ++this.clock;
    const token = ++slot.token;
    player.pause();
    player
      .replaceAsync({ uri: src.uri })
      .then(() => {
        if (slot.token !== token) return; // reassigned while loading
        slot.loadedKey = src.key;
        // Hold on the first frame; the current one starts from the top too.
        player.currentTime = 0;
        this.applyPlayback();
        this.emit();
      })
      .catch((e: unknown) => {
        if (slot.token !== token) return;
        if (__DEV__) console.warn('PlayerPool: could not load reel', src.key, e);
        // Leave the slot empty so the page keeps its poster instead of a dead player.
        slot.key = null;
        slot.uri = null;
        this.emit();
        this.onLoadFailed?.(src.key);
      });
  }

  /**
   * Drive every player from the pool's intended state. play()/pause() are issued unconditionally
   * (both are idempotent): `player.playing` is event-driven and lags, and on web it only updates
   * through mounted <video> elements, so it cannot be used as a guard.
   */
  private applyPlayback(): void {
    const blocked = this.suspended.size > 0 || this.userPaused;
    this.slots.forEach((s, i) => {
      const p = this.players[i];
      if (!p) return;
      const isCurrent = s.key !== null && s.key === this.currentKey;
      if (isCurrent && !blocked) {
        p.play();
        s.wasCurrent = true;
        return;
      }
      p.pause();
      if (!isCurrent && s.wasCurrent) {
        // Left the screen: rewind so a return starts cleanly on the first frame.
        s.wasCurrent = false;
        if (s.loadedKey === s.key) p.currentTime = 0;
      }
    });
  }

  /** A VideoView just attached to a player: re-assert play/pause (web syncs state on mount). */
  reapply(): void {
    this.applyPlayback();
  }

  /** Called by the VideoView that shows `key` once it has drawn a frame. */
  markFirstFrame(key: string): void {
    const slot = this.slots.find((s) => s.key === key);
    if (!slot || slot.firstFrameKey === key) return;
    slot.firstFrameKey = key;
    this.applyPlayback();
    this.emit();
    if (__DEV__) {
      const rec = [...this.settles].reverse().find((r) => r.key === key);
      if (rec && rec.firstFrameMs === null) rec.firstFrameMs = Date.now() - rec.at;
    }
  }

  isFirstFrameDrawn(key: string): boolean {
    return this.slots.some((s) => s.key === key && s.firstFrameKey === key);
  }

  /** Tap on the current reel. Returns the new paused state. */
  togglePause(key: string): boolean {
    if (key !== this.currentKey) return this.userPaused;
    this.userPaused = !this.userPaused;
    this.applyPlayback();
    this.emit();
    return this.userPaused;
  }

  setSuspended(reason: SuspendReason, on: boolean): void {
    const had = this.suspended.has(reason);
    if (on === had) return;
    if (on) this.suspended.add(reason);
    else this.suspended.delete(reason);
    this.applyPlayback();
  }

  /** Dev: slot table for debugging / the web walk. */
  debug(): {
    key: string | null;
    loaded: boolean;
    firstFrame: boolean;
    playing: boolean;
    current: boolean;
  }[] {
    return this.slots.map((s, i) => ({
      key: s.key,
      loaded: s.loadedKey === s.key && s.key !== null,
      firstFrame: s.firstFrameKey === s.key && s.key !== null,
      playing: this.players[i]?.playing ?? false,
      current: s.key !== null && s.key === this.currentKey,
    }));
  }
}

const PoolContext = createContext<PoolStore | null>(null);

function setupPlayer(p: VideoPlayer): void {
  p.loop = true; // loop the current reel; never auto-advance (anti-trance rule)
  p.muted = getMuted();
}

export function PlayerPoolProvider({ children }: { children: React.ReactNode }) {
  // Exactly four hooks, always in this order: players live as long as the feed.
  const p0 = useVideoPlayer(null, setupPlayer);
  const p1 = useVideoPlayer(null, setupPlayer);
  const p2 = useVideoPlayer(null, setupPlayer);
  const p3 = useVideoPlayer(null, setupPlayer);
  const [store] = useState(() => new PoolStore());

  useEffect(() => {
    store.attach([p0, p1, p2, p3]);
  }, [store, p0, p1, p2, p3]);

  // Mute follows the global store instantly, by direct property writes.
  useEffect(() => subscribeMuted((m) => store.setMuted(m)), [store]);

  // App background pauses everything.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) =>
      store.setSuspended('background', s !== 'active'),
    );
    return () => sub.remove();
  }, [store]);

  // Web: a hidden tab pauses everything.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVis = () => store.setSuspended('hidden', document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [store]);

  // Web: the browser refused an unmuted play() (no user gesture yet). expo-video does not surface
  // the rejected promise, so catch it globally: fall back to muted and retry.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onRejection = (e: PromiseRejectionEvent) => {
      if ((e.reason as { name?: string } | null)?.name !== 'NotAllowedError') return;
      e.preventDefault();
      autoplayBlocked();
      store.setMuted(true);
      store.reapply();
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [store]);

  // Dev: expose the pool for the automated web walk.
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'web') return;
    const g = globalThis as { __reelPools?: PoolStore[] };
    g.__reelPools = [...(g.__reelPools ?? []), store];
    return () => {
      g.__reelPools = (g.__reelPools ?? []).filter((s) => s !== store);
    };
  }, [store]);

  return <PoolContext.Provider value={store}>{children}</PoolContext.Provider>;
}

export function usePlayerPool(): PoolStore {
  const store = useContext(PoolContext);
  if (!store) throw new Error('usePlayerPool must be used inside <PlayerPoolProvider>');
  return store;
}

export type PooledPlayer = {
  player: VideoPlayer | null;
  current: boolean;
  paused: boolean;
  /** The source finished loading in the lent player. */
  loaded: boolean;
  /** This key's own first frame has been drawn (never true for a recycled player's old frame). */
  drawn: boolean;
};

/** The player lent to `key`, if any. Re-renders only when this key's slot state changes. */
export function usePooledPlayer(key: string): PooledPlayer {
  const store = usePlayerPool();
  const snap = useSyncExternalStore(
    store.subscribe,
    () => store.snapshot(key),
    () => store.snapshot(key),
  );
  const [slot, current, paused, loaded, drawn] = snap.split('|').map(Number);
  return {
    player: slot >= 0 ? store.player(slot) : null,
    current: current === 1,
    paused: paused === 1,
    loaded: loaded === 1,
    drawn: drawn === 1,
  };
}
