import { describe, expect, test } from 'bun:test';

import { brand } from '@/config/brand';

import {
  NON_PUBLIC_NOTE,
  SHARE_TARGETS,
  embedCode,
  embedUrl,
  formatTime,
  parseStartTime,
  postUrl,
  shareTargetUrl,
  shareText,
  startAtLabel,
} from './share';

const ID = '0b8f6a1e-1111-4222-8333-444455556666';
const LINK = `${brand.webUrl}/p/${ID}`;
const TEXT = 'Morning light & "quotes" + more?';

describe('urls', () => {
  test('postUrl comes from brand.webUrl and only adds t when positive', () => {
    expect(postUrl(ID)).toBe(LINK);
    expect(postUrl(ID, 0)).toBe(LINK);
    expect(postUrl(ID, null)).toBe(LINK);
    expect(postUrl(ID, 12.9)).toBe(`${LINK}?t=12`);
  });

  test('embed url and iframe snippet', () => {
    expect(embedUrl(ID)).toBe(`${LINK}/embed`);
    const code = embedCode(ID);
    expect(code.startsWith(`<iframe src="${LINK}/embed"`)).toBe(true);
    expect(code.includes('allow="autoplay; fullscreen"')).toBe(true);
    expect(code.endsWith('</iframe>')).toBe(true);
  });
});

describe('time', () => {
  test('format and label', () => {
    expect(formatTime(12)).toBe('0:12');
    expect(formatTime(65.7)).toBe('1:05');
    expect(startAtLabel(12)).toBe('Start at 0:12');
  });

  test('parseStartTime', () => {
    expect(parseStartTime('12')).toBe(12);
    expect(parseStartTime('12s')).toBe(12);
    expect(parseStartTime('1:05')).toBe(65);
    expect(parseStartTime(['7', '9'])).toBe(7);
    expect(parseStartTime('abc')).toBeNull();
    expect(parseStartTime('-3')).toBeNull();
    expect(parseStartTime(undefined)).toBeNull();
  });
});

describe('text', () => {
  test('caption wins, long captions are trimmed, fallback names the app', () => {
    expect(shareText({ caption: '  hi  ', kind: 'reel' })).toBe('hi');
    expect(shareText({ caption: 'x'.repeat(200), kind: 'post' }).length).toBe(120);
    expect(shareText({ caption: null, kind: 'reel' })).toBe(`Watch this reel on ${brand.appName}`);
    expect(shareText({ caption: null, kind: 'post' })).toBe(`Take a look on ${brand.appName}`);
  });
});

describe('targets', () => {
  const at = `${LINK}?t=12`;
  const enc = encodeURIComponent;

  test('there are 13, each with a unique id', () => {
    expect(SHARE_TARGETS.length).toBe(13);
    expect(new Set(SHARE_TARGETS.map((t) => t.id)).size).toBe(13);
  });

  test('every url encodes the text and the link, including the t param', () => {
    for (const t of SHARE_TARGETS) {
      const url = t.href(at, TEXT);
      expect(url.includes(enc(at))).toBe(true);
      expect(url.includes(' ')).toBe(false);
      expect(url.includes('"')).toBe(false);
    }
  });

  test('exact urls', () => {
    const both = enc(`${TEXT} ${LINK}`);
    expect(shareTargetUrl('messages', LINK, TEXT)).toBe(`sms:?&body=${both}`);
    expect(shareTargetUrl('whatsapp', LINK, TEXT)).toBe(`https://wa.me/?text=${both}`);
    expect(shareTargetUrl('telegram', LINK, TEXT)).toBe(
      `https://t.me/share/url?url=${enc(LINK)}&text=${enc(TEXT)}`,
    );
    expect(shareTargetUrl('messenger', LINK, TEXT)).toBe(`fb-messenger://share/?link=${enc(LINK)}`);
    expect(shareTargetUrl('x', LINK, TEXT)).toBe(
      `https://x.com/intent/post?text=${enc(TEXT)}&url=${enc(LINK)}`,
    );
    expect(shareTargetUrl('threads', LINK, TEXT)).toBe(`https://www.threads.net/intent/post?text=${both}`);
    expect(shareTargetUrl('bluesky', LINK, TEXT)).toBe(`https://bsky.app/intent/compose?text=${both}`);
    expect(shareTargetUrl('facebook', LINK, TEXT)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${enc(LINK)}`,
    );
    expect(shareTargetUrl('reddit', LINK, TEXT)).toBe(
      `https://www.reddit.com/submit?url=${enc(LINK)}&title=${enc(TEXT)}`,
    );
    expect(shareTargetUrl('linkedin', LINK, TEXT)).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${enc(LINK)}`,
    );
    expect(shareTargetUrl('pinterest', LINK, TEXT)).toBe(
      `https://www.pinterest.com/pin/create/button/?url=${enc(LINK)}&description=${enc(TEXT)}`,
    );
    expect(shareTargetUrl('tumblr', LINK, TEXT)).toBe(
      `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${enc(LINK)}&caption=${enc(TEXT)}`,
    );
    expect(shareTargetUrl('email', LINK, TEXT)).toBe(
      `mailto:?subject=${enc(TEXT)}&body=${enc(`${TEXT}\n\n${LINK}`)}`,
    );
  });

  test('the non-public note is one sentence', () => {
    expect(NON_PUBLIC_NOTE).toBe('Only people who can already see this post can open the link.');
  });
});
