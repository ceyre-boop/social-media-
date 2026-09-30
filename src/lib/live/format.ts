/** "1.2k watching" style viewer count. Viewer counts are explicitly wanted on live. */
export function formatViewers(n: number): string {
  if (n < 1000) return `${n} watching`;
  const k = Math.round(n / 100) / 10;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k watching`;
}

export function formatStarted(minutes: number): string {
  if (minutes < 1) return 'Just started';
  if (minutes < 60) return `Started ${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `Started ${h}h ago` : `Started ${h}h ${m}m ago`;
}
