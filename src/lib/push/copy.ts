/**
 * Every word a notification says, in one place. Used on the device (in-app banner) and by the
 * push-dispatch Edge Function (Deno imports this file directly, so it must stay dependency-free
 * apart from brand config, and keep the explicit `.ts` import below).
 *
 * Tone: warm and specific. Never urgency, guilt, or "you're missing out". copy.test.ts fails on
 * banned phrases, exclamation marks and shouting.
 */
import { brand } from '../../config/brand.ts';

export const NOTIFICATION_TYPES = [
  'moment_prompt',
  'friend_request',
  'friend_accepted',
  'followed_live',
  'comment',
  'gift_received',
  'like',
  'support_reply',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationCopy = { title: string; body: string };

/** Settings labels, one line each, for the preferences screen. */
export const NOTIFICATION_LABELS: Record<NotificationType, { label: string; explain: string }> = {
  moment_prompt: {
    label: 'Moment prompts',
    explain: 'A gentle nudge, once or twice a day, to share what you are up to with friends.',
  },
  friend_request: { label: 'Friend requests', explain: 'When someone asks to be your friend.' },
  friend_accepted: { label: 'New friends', explain: 'When someone accepts your friend request.' },
  followed_live: { label: 'Going live', explain: 'When someone you follow starts a live.' },
  comment: { label: 'Comments', explain: 'When someone comments on your post.' },
  gift_received: { label: 'Gifts', explain: 'When someone sends you a gift.' },
  like: { label: 'Likes', explain: 'When someone likes your post. Off unless you turn it on.' },
  support_reply: { label: 'Help replies', explain: 'When we answer a question you asked us.' },
};

const M = brand.moment.singular;

/**
 * Moment prompt lines: an invitation to share something ordinary, nothing more. The dispatcher
 * (migration 017) picks data.line in 0..length-1; keep ops.moment_prompt_line_count() in step.
 * Never a countdown, never "your friends are waiting", never a streak.
 */
export const MOMENT_PROMPT_LINES = [
  `What are you up to? Share a ${M.toLowerCase()} with your friends.`,
  'What does your day look like right now?',
  "What's in front of you at the moment?",
  'A small look at your day, if you feel like sharing one.',
  "Whatever you're doing, it counts. Show your friends?",
  "What's around you right now? Ordinary is perfect.",
  'Take a second to share what you are doing, whenever suits you.',
] as const;

const MAX_NAME = 40;
const MAX_SNIPPET = 80;

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const s = value.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Renders a notification from its type and the data stored with it (actor_name, gift_name, snippet). */
export function notificationCopy(
  type: NotificationType,
  data: Record<string, unknown> | null | undefined,
): NotificationCopy {
  const d = data ?? {};
  const who = clip(d.actor_name, MAX_NAME) || 'Someone';
  const gift = clip(d.gift_name, MAX_NAME) || 'a gift';
  const snippet = clip(d.snippet, MAX_SNIPPET);

  switch (type) {
    case 'moment_prompt':
    {
      const i = typeof d.line === 'number' && Number.isInteger(d.line) ? d.line : 0;
      return {
        title: brand.appName,
        body: MOMENT_PROMPT_LINES[i >= 0 && i < MOMENT_PROMPT_LINES.length ? i : 0],
      };
    }
    case 'friend_request':
      return { title: 'Friend request', body: `${who} would like to be friends.` };
    case 'friend_accepted':
      return { title: 'New friend', body: `${who} accepted your friend request. You are friends now.` };
    case 'followed_live':
      return { title: 'Live now', body: `${who} started a live. Come by if you like.` };
    case 'comment':
      return {
        title: 'New comment',
        body: snippet ? `${who} commented: “${snippet}”` : `${who} commented on your post.`,
      };
    case 'gift_received':
      return { title: 'A gift for you', body: `${who} sent you ${gift}.` };
    case 'like':
      return { title: 'Your post', body: `${who} liked your post.` };
    case 'support_reply':
      return { title: 'We replied', body: 'There is an answer to your question. Read it whenever suits you.' };
    default:
      return { title: brand.appName, body: 'There is something new for you.' };
  }
}
