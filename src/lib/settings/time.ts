/** Wall-clock times as Postgres `time` strings ("22:00:00") and as words for people. */

export const STEP_MINUTES = 30;
const DAY = 24 * 60;

/** "22:00:00" or "22:00" to minutes since midnight. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/** Minutes since midnight (wrapped into one day) to "HH:MM:SS". */
export function toTime(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

/** "22:00:00" to "10:00 PM". */
export function formatTime(t: string): string {
  const m = toMinutes(t);
  const h = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Move a time by a number of steps, wrapping around midnight. */
export function stepTime(t: string, steps: number): string {
  return toTime(toMinutes(t) + steps * STEP_MINUTES);
}

/** Waking hours must start before they end (a database rule); keep at least one step between. */
export function canStepWaking(start: string, end: string): boolean {
  return toMinutes(start) + STEP_MINUTES <= toMinutes(end);
}
