import { useSyncExternalStore } from 'react';

import { readMuted, writeMuted } from './muteStorage';

type MutedListener = (muted: boolean) => void;

const DEFAULT_MUTED = true;
const listeners = new Set<MutedListener>();

let hasReadStorage = false;
let muted = DEFAULT_MUTED;

function initialize(): void {
  if (hasReadStorage) return;
  hasReadStorage = true;
  muted = readMuted() ?? DEFAULT_MUTED;
}

/** Return the current global mute preference, reading it from storage on first access. */
export function getMuted(): boolean {
  initialize();
  return muted;
}

/** Update the global mute preference and synchronously notify observers when it changes. */
export function setMuted(next: boolean): void {
  initialize();
  if (muted === next) return;

  muted = next;
  writeMuted(next);
  for (const listener of listeners) listener(next);
}

/** Invert the current global mute preference. */
export function toggleMuted(): void {
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
