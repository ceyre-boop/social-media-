/**
 * The ONLY place the product name and currency name live. Both are placeholders: the product
 * name is changing (trademark conflict) and the currency name is undecided. To rename, edit the
 * values below. `bun run check:brand` fails if either name appears anywhere else in `src/`.
 *
 * Files that must be hand-edited on a rename (they cannot import TypeScript): none. The Supabase
 * email templates and subjects in `supabase/config.toml` are deliberately brand-free
 * ("Your sign-in code"). Historical SQL migration comments and README.md/docs prose may still
 * mention the old name; they are not user-facing and applied migrations are never edited.
 * `README.md` and `DESIGN.md` headings are prose: update them by hand for tidiness.
 *
 * `storagePrefix` is neutral and must NOT change with the brand: it namespaces persisted keys.
 */
export const brand = {
  appName: 'Smiley', // placeholder: product name is changing (trademark)
  tagline: 'A place you come back to because it feels good.',
  // Working name for the friends-only prompted post (brief-milestone-3 §1).
  momentsName: 'Moments',
  currency: { singular: 'blip', plural: 'blips', perDollar: 100 }, // placeholder name
  // Working name for the friends-only prompted post (brief M3 §1). Placeholder like the app name.
  moment: { singular: 'Moment', plural: 'Moments' },
  // Base URL for shared links (/p/<id>, /p/<id>/embed). Placeholder: the real domain lands with the rename.
  webUrl: 'https://example.app',
  storagePrefix: 'app',
  // Pre-rename persisted-key prefix, read once and migrated to storagePrefix. Never change it.
  legacyStoragePrefix: 'smiley',
} as const;

/** "1 blip", "1,200 blips". */
export function formatCurrency(n: number): string {
  const { singular, plural } = brand.currency;
  return `${n.toLocaleString('en-US')} ${n === 1 ? singular : plural}`;
}

/** The published rate: "100 blips = $1.00". */
export function currencyRate(): string {
  const { perDollar } = brand.currency;
  return `${formatCurrency(perDollar)} = $1.00`;
}

/** Capitalised plural currency name for labels: "Blips". */
export function currencyLabel(): string {
  const p = brand.currency.plural;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Readable document title: "Feed · AppName", or just the name for the root title. */
export function pageTitle(title?: string): string {
  return !title || title === brand.appName ? brand.appName : `${title} · ${brand.appName}`;
}

/** Namespaced persisted-storage key, e.g. storageKey('muted') -> "app.muted". */
export function storageKey(name: string): string {
  return `${brand.storagePrefix}.${name}`;
}
