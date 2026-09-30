import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { readMuted, writeMuted } from './muteStorage';

type MutedListener = (muted: boolean) => void;

const DEFAULT_MUTED = true;
const listeners = new Set<MutedListener>();

let hasReadStorage = false;
/** The stored preference. */
let muted = DEFAULT_MUTED;
/**
 * Browsers reject unmuted play() until the first user gesture. On web, playback starts muted and
 * the stored preference is applied at the first gesture. Native has no such gate.
 */
let gestured = Platform.OS !== 'web';
let liftedAt = 0;
const GESTURE_TAP_WINDOW_MS = 600;

function notify(): void {
  const effective = muted || !gestured;
  for (const listener of listeners) listener(effective);
}

function liftGate(): void {
  if (gestured) return;
  gestured = true;
  if (!muted) liftedAt = Date.now();
  notify();
}

function armGesture(): void {
  if (typeof document === 'undefined') return;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const onGesture = () => {
    for (const e of events) document.removeEventListener(e, onGesture, true);
    liftGate();
  };
  for (const e of events) document.addEventListener(e, onGesture, true);
}

function initialize(): void {
  if (hasReadStorage) return;
  hasReadStorage = true;
  muted = readMuted() ?? DEFAULT_MUTED;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const nav = globalThis.navigator as { userActivation?: { hasBeenActive: boolean } } | undefined;
    if (nav?.userActivation?.hasBeenActive) {
      gestured = true;
    } else {
      armGesture();
    }
  }
}

/**
 * Web: the browser refused an unmuted play(). Fall back to muted until the next gesture (the
 * speaker button then shows muted, which is the hint to tap it).
 */
export function autoplayBlocked(): void {
  initialize();
  if (Platform.OS !== 'web' || !gestured || muted) return;
  gestured = false;
  notify();
  armGesture();
}

/** The effective mute state: the stored preference, or muted while web autoplay is gated. */
export function getMuted(): boolean {
  initialize();
  return muted || !gestured;
}

/** Update the global mute preference and synchronously notify observers when it changes. */
export function setMuted(next: boolean): void {
  initialize();
  const wasGated = !gestured;
  gestured = true; // an explicit choice is a user gesture
  if (muted === next) {
    if (wasGated) notify();
    return;
  }

  muted = next;
  writeMuted(next);
  notify();
}

/** Invert the current global mute state. */
export function toggleMuted(): void {
  initialize();
  // The tap that lifted the autoplay gate is this same tap: do not immediately mute again.
  if (Date.now() - liftedAt < GESTURE_TAP_WINDOW_MS) {
    liftedAt = 0;
    return;
  }
  setMuted(!getMuted());
}

/** Subscribe to future mute-preference changes. */
export function subscribeMuted(listener: MutedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React subscription to the global mute preference. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, getMuted, getMuted);
}
