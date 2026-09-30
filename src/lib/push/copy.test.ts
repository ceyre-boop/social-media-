import { describe, expect, test } from 'bun:test';

import { brand } from '@/config/brand';

import { NOTIFICATION_TYPES, notificationCopy, type NotificationType } from './copy';

/** Manufactured urgency, guilt, FOMO. None of these may ever appear in notification copy. */
const BANNED = [
  'hurry',
  "don't miss",
  'dont miss',
  'do not miss',
  'missing out',
  'miss out',
  'last chance',
  'minutes left',
  'hours left',
  'waiting for you',
  'before it',
  'expires',
  'streak',
  'act now',
  'only today',
];

const SAMPLES: Record<string, unknown>[] = [
  {},
  { actor_name: 'Sam', gift_name: 'a paper lantern', snippet: 'Love this' },
  { actor_name: '', snippet: '' },
];

function allCopy(): { type: NotificationType; text: string }[] {
  return NOTIFICATION_TYPES.flatMap((type) =>
    SAMPLES.map((data) => {
      const c = notificationCopy(type, data);
      return { type, text: `${c.title}\n${c.body}` };
    }),
  );
}

describe('notification copy', () => {
  test('covers all eight types', () => {
    expect(NOTIFICATION_TYPES.length).toBe(8);
  });

  test('never uses urgency, guilt or FOMO wording', () => {
    const hits = allCopy().flatMap(({ type, text }) =>
      BANNED.filter((p) => text.toLowerCase().includes(p)).map((p) => `${type}: "${p}"`),
    );
    expect(hits).toEqual([]);
  });

  test('never shouts (no exclamation marks, no all-caps words)', () => {
    const loud = allCopy().filter(({ text }) => /!|\b[A-Z]{3,}\b/.test(text));
    expect(loud.map((l) => l.type)).toEqual([]);
  });

  test('is specific: names the person when we know them', () => {
    const data = { actor_name: 'Sam', gift_name: 'a paper lantern', snippet: 'Love this' };
    for (const type of [
      'friend_request',
      'friend_accepted',
      'followed_live',
      'comment',
      'gift_received',
      'like',
    ] as const) {
      expect(notificationCopy(type, data).body.includes('Sam')).toBe(true);
    }
    expect(notificationCopy('gift_received', data).body.includes('a paper lantern')).toBe(true);
    expect(notificationCopy('comment', data).body.includes('Love this')).toBe(true);
  });

  test('falls back gracefully when the name is missing', () => {
    for (const type of NOTIFICATION_TYPES) {
      const c = notificationCopy(type, {});
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(c.body.includes('undefined')).toBe(false);
      expect(c.body.includes('null')).toBe(false);
    }
  });

  test('uses the app name from brand config', () => {
    expect(notificationCopy('moment_prompt', {}).title).toBe(brand.appName);
  });

  test('clips long user-supplied text', () => {
    const c = notificationCopy('comment', { actor_name: 'x'.repeat(500), snippet: 'y'.repeat(500) });
    expect(c.body.length).toBeLessThanOrEqual(200);
  });

  test('an unknown type still produces calm, generic copy', () => {
    const c = notificationCopy('something_new' as NotificationType, {});
    expect(c.title).toBe(brand.appName);
    expect(c.body.length).toBeGreaterThan(0);
  });
});
