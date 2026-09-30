import { describe, expect, test } from 'bun:test';

import {
  COMBO_WINDOW_MS,
  RAIL_MAX,
  addToRail,
  emptyRail,
  expireRail,
  nextRailExpiry,
} from './rail';
import type { GiftSender } from './rail';

const bea: GiftSender = { id: 'bea', name: 'Bea', username: 'bea' };
const tomo: GiftSender = { id: 'tomo', name: 'Tomo', username: 'tomo' };
const wave = (sender = bea, giftId = 'wave') => ({ giftId, sender, durationMs: 1200, puff: false });

describe('rail combos', () => {
  test('the same gift from the same sender increments the existing card', () => {
    let s = addToRail(emptyRail, wave(), 0);
    s = addToRail(s, wave(), 500);
    s = addToRail(s, wave(), 900);
    expect(s.cards.length).toBe(1);
    expect(s.cards[0].count).toBe(3);
    expect(s.cards[0].bump).toBe(2);
  });

  test('each send resets the card life and the 3s window', () => {
    let s = addToRail(emptyRail, wave(), 0);
    s = addToRail(s, wave(), 1000);
    expect(s.cards[0].expiresAt).toBe(2200);
    s = addToRail(s, wave(), 2000);
    expect(s.cards[0].expiresAt).toBe(3200);
    expect(s.cards[0].count).toBe(3);
  });

  test('a different sender or a different gift starts its own card', () => {
    let s = addToRail(emptyRail, wave(), 0);
    s = addToRail(s, wave(tomo), 100);
    s = addToRail(s, wave(bea, 'clap'), 200);
    expect(s.cards.length).toBe(3);
    expect(s.cards.every((c) => c.count === 1)).toBe(true);
  });

  test('a card that already left but is inside the 3s window continues the count', () => {
    let s = addToRail(emptyRail, wave(), 0); // expires at 1200
    s = expireRail(s, 1300);
    expect(s.cards.length).toBe(0);
    s = addToRail(s, wave(), 2500); // 2.5s after the last send: still a combo
    expect(s.cards.length).toBe(1);
    expect(s.cards[0].count).toBe(2);
  });

  test('past the 3s window the count starts over', () => {
    let s = addToRail(emptyRail, wave(), 0);
    s = expireRail(s, 1300);
    s = addToRail(s, wave(), COMBO_WINDOW_MS + 1);
    expect(s.cards[0].count).toBe(1);
  });
});

describe('rail cap', () => {
  test('a fifth card pushes the oldest out early', () => {
    let s = emptyRail;
    const ids = ['a', 'b', 'c', 'd', 'e'];
    ids.forEach((id, i) => {
      s = addToRail(s, wave(bea, id), i * 10);
    });
    expect(s.cards.length).toBe(RAIL_MAX);
    expect(s.cards.map((c) => c.giftId)).toEqual(['b', 'c', 'd', 'e']);
  });

  test('new cards are appended at the end (they enter from the bottom)', () => {
    let s = addToRail(emptyRail, wave(bea, 'a'), 0);
    s = addToRail(s, wave(bea, 'b'), 10);
    expect(s.cards[s.cards.length - 1].giftId).toBe('b');
  });
});

describe('rail expiry', () => {
  test('expireRail drops finished cards and reports the next expiry', () => {
    let s = addToRail(emptyRail, wave(bea, 'a'), 0);
    s = addToRail(s, { ...wave(bea, 'b'), durationMs: 2000 }, 100);
    expect(nextRailExpiry(s)).toBe(1200);
    s = expireRail(s, 1200);
    expect(s.cards.map((c) => c.giftId)).toEqual(['b']);
    expect(nextRailExpiry(s)).toBe(2100);
    expect(nextRailExpiry(expireRail(s, 5000))).toBeNull();
  });
});
