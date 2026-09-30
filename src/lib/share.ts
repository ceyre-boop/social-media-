import type { Ionicons } from '@expo/vector-icons';

import { brand } from '@/config/brand';

/** The public web address of a post. `t` (whole seconds) makes the viewer start there. */
export function postUrl(id: string, t?: number | null): string {
  const base = `${brand.webUrl.replace(/\/+$/, '')}/p/${encodeURIComponent(id)}`;
  const seconds = t == null ? 0 : Math.floor(t);
  return Number.isFinite(seconds) && seconds > 0 ? `${base}?t=${seconds}` : base;
}

/** The chrome-free player page that embed snippets point at. */
export function embedUrl(id: string): string {
  return `${postUrl(id)}/embed`;
}

/** A copy-paste iframe (9:16). */
export function embedCode(id: string): string {
  return `<iframe src="${embedUrl(id)}" width="360" height="640" style="border:0" allow="autoplay; fullscreen" loading="lazy" title="${brand.appName}"></iframe>`;
}

/** "0:12", "1:05". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Label for the copy-at-time action. */
export function startAtLabel(seconds: number): string {
  return `Start at ${formatTime(seconds)}`;
}

/** Parse a `?t=` value: "12", "12s" or "1:05" to whole seconds; anything else is null. */
export function parseStartTime(raw: string | string[] | null | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const clock = /^(\d+):([0-5]?\d)$/.exec(v);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const plain = /^(\d+)s?$/.exec(v);
  return plain ? Number(plain[1]) : null;
}

/** What gets shared alongside the link. */
export function shareText(post: { caption: string | null; kind: 'post' | 'reel' }): string {
  const caption = post.caption?.trim();
  if (caption) return caption.length > 120 ? `${caption.slice(0, 117)}...` : caption;
  return `${post.kind === 'reel' ? 'Watch this reel' : 'Take a look'} on ${brand.appName}`;
}

export type ShareTargetId =
  | 'messages'
  | 'whatsapp'
  | 'telegram'
  | 'messenger'
  | 'x'
  | 'threads'
  | 'bluesky'
  | 'facebook'
  | 'reddit'
  | 'linkedin'
  | 'pinterest'
  | 'tumblr'
  | 'email';

export type ShareTarget = {
  id: ShareTargetId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Build the intent URL. Both values are raw; encoding happens here. */
  href: (link: string, text: string) => string;
};

const q = encodeURIComponent;

/** Twelve link intents plus email: open in the app if installed, else the web composer. */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  {
    id: 'messages',
    label: 'Messages',
    icon: 'chatbubble-outline',
    href: (link, text) => `sms:?&body=${q(`${text} ${link}`)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp',
    href: (link, text) => `https://wa.me/?text=${q(`${text} ${link}`)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'paper-plane-outline',
    href: (link, text) => `https://t.me/share/url?url=${q(link)}&text=${q(text)}`,
  },
  {
    id: 'messenger',
    label: 'Messenger',
    icon: 'chatbubble-ellipses-outline',
    // Messenger has no web composer without a Facebook app id; the scheme opens the app.
    href: (link) => `fb-messenger://share/?link=${q(link)}`,
  },
  {
    id: 'x',
    label: 'X',
    icon: 'logo-x',
    href: (link, text) => `https://x.com/intent/post?text=${q(text)}&url=${q(link)}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    icon: 'logo-threads',
    href: (link, text) => `https://www.threads.net/intent/post?text=${q(`${text} ${link}`)}`,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    icon: 'cloud-outline',
    href: (link, text) => `https://bsky.app/intent/compose?text=${q(`${text} ${link}`)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    href: (link) => `https://www.facebook.com/sharer/sharer.php?u=${q(link)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    icon: 'logo-reddit',
    href: (link, text) => `https://www.reddit.com/submit?url=${q(link)}&title=${q(text)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'logo-linkedin',
    href: (link) => `https://www.linkedin.com/sharing/share-offsite/?url=${q(link)}`,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    icon: 'logo-pinterest',
    href: (link, text) => `https://www.pinterest.com/pin/create/button/?url=${q(link)}&description=${q(text)}`,
  },
  {
    id: 'tumblr',
    label: 'Tumblr',
    icon: 'logo-tumblr',
    href: (link, text) => `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${q(link)}&caption=${q(text)}`,
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail-outline',
    href: (link, text) => `mailto:?subject=${q(text)}&body=${q(`${text}\n\n${link}`)}`,
  },
];

export function shareTargetUrl(id: ShareTargetId, link: string, text: string): string {
  const target = SHARE_TARGETS.find((t) => t.id === id);
  if (!target) throw new Error(`Unknown share target: ${id}`);
  return target.href(link, text);
}

/** Note shown for anything that is not public: the link only works for people RLS already lets in. */
export const NON_PUBLIC_NOTE = 'Only people who can already see this post can open the link.';
