import { deviceTimezone } from '@/lib/timezone';

const FALLBACK = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** Every IANA zone the runtime knows (plus UTC), sorted; a short list if it can't enumerate. */
export function allTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = fn?.('timeZone');
    if (list && list.length > 0) return list.includes('UTC') ? list : ['UTC', ...list];
  } catch {
    // fall through
  }
  return FALLBACK;
}

/** "America/Los_Angeles" to "Los Angeles (America)". */
export function timezoneLabel(tz: string): string {
  const parts = tz.split('/');
  if (parts.length < 2) return tz;
  return `${parts.slice(1).join(' / ').replace(/_/g, ' ')} (${parts[0]})`;
}

/** Case-insensitive match on any part of the name, underscores as spaces. Empty query: everything. */
export function filterTimezones(all: string[], query: string): string[] {
  const q = query.trim().toLowerCase().replace(/[\s_]+/g, ' ');
  if (!q) return all;
  return all.filter((tz) => tz.toLowerCase().replace(/_/g, ' ').includes(q));
}

export { deviceTimezone };
