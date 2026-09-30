import { describe, expect, test } from 'bun:test';

import { brand } from '@/config/brand';

import { readFileSync } from 'node:fs';

import {
  MOMENT_PROMPT_LINES,
  NOTIFICATION_TYPES,
  notificationCopy,
  type NotificationType,
} from './copy';

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

  test('moment prompts: a varied set of 5-8 lines, each reachable by data.line', () => {
    const texts = MOMENT_PROMPT_LINES.map((_, line) => notificationCopy('moment_prompt', { line }).body);
    expect(MOMENT_PROMPT_LINES.length).toBeGreaterThanOrEqual(5);
    expect(MOMENT_PROMPT_LINES.length).toBeLessThanOrEqual(8);
    expect(new Set(texts).size).toBe(MOMENT_PROMPT_LINES.length);
    const extra = ['waiting', 'left', 'streak', 'late', 'quick'];
    for (const t of texts) {
      const lower = t.toLowerCase();
      expect([...BANNED, ...extra].filter((p) => lower.includes(p))).toEqual([]);
      expect(/!|\b[A-Z]{3,}\b/.test(t)).toBe(false);
    }
    expect(notificationCopy('moment_prompt', { line: 99 }).body).toBe(MOMENT_PROMPT_LINES[0]);
    expect(notificationCopy('moment_prompt', { line: 'x' }).body).toBe(MOMENT_PROMPT_LINES[0]);
  });

  test('the database dispatcher picks from exactly this many prompt lines', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260930000017_moment_prompts.sql', import.meta.url),
      'utf8',
    );
    const n = /moment_prompt_line_count\(\) returns int\s+language sql immutable as \$\$ select (\d+) \$\$/.exec(
      sql,
    )?.[1];
    expect(Number(n)).toBe(MOMENT_PROMPT_LINES.length);
  });

  test('an unknown type still produces calm, generic copy', () => {
    const c = notificationCopy('something_new' as NotificationType, {});
    expect(c.title).toBe(brand.appName);
    expect(c.body.length).toBeGreaterThan(0);
  });
});
