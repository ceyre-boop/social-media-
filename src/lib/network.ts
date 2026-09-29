import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Connectivity without a native module. We combine:
 *  - browser online/offline events (web),
 *  - the outcome of real requests (the fetch wrapper reports success/failure),
 *  - app foregrounding, after which we optimistically assume online and let requests decide.
 */
let online = true;
const listeners = new Set<() => void>();

export function setOnline(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => true,
  );
}

/**
 * Calls `revalidate` when connectivity comes back or the app returns to the foreground.
 * Screens use it to refetch instead of leaving stale/failed data on screen.
 */
export function useRevalidate(revalidate: () => void) {
  const isOnline = useOnline();
  const wasOnline = useRef(isOnline);
  const latest = useRef(revalidate);
  useEffect(() => {
    latest.current = revalidate;
  });

  useEffect(() => {
    if (isOnline && !wasOnline.current) latest.current();
    wasOnline.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setOnline(true); // optimistic: the next request decides
        latest.current();
      }
    });
    return () => sub.remove();
  }, []);
}
