/** Validates a real calendar date in YYYY-MM-DD that is in the past. */
export function isValidPastDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real && date.getTime() < Date.now();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;

export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** US format as typed: keeps digits only and inserts dashes, 04231995 -> 04-23-1995. */
export function formatDob(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/** MM-DD-YYYY (as typed) to ISO YYYY-MM-DD (what the database and auth metadata use). Null if malformed. */
export function dobToIso(us: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(us);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

export const MIN_AGE = 13;

/** True when someone born on `dob` (YYYY-MM-DD) has turned `years` by today. */
export function isAtLeastAge(dob: string, years: number, now = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age >= years;
}
