/**
 * The device's IANA timezone (e.g. "America/Los_Angeles"), or undefined when the runtime can't
 * tell. Sent at signup and editable in settings; the database validates it and falls back to UTC.
 * Never inferred from IP.
 */
export function deviceTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
  } catch {
    return undefined;
  }
}
