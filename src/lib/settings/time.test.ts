import { describe, expect, test } from 'bun:test';

import { canStepWaking, formatTime, stepTime, toMinutes, toTime } from './time';
import { filterTimezones } from './timezones';

describe('time helpers', () => {
  test('format as words', () => {
    expect(formatTime('22:00:00')).toBe('10:00 PM');
    expect(formatTime('08:30:00')).toBe('8:30 AM');
    expect(formatTime('00:00:00')).toBe('12:00 AM');
    expect(formatTime('12:00:00')).toBe('12:00 PM');
  });
  test('round trip and wrap', () => {
    expect(toTime(toMinutes('09:00'))).toBe('09:00:00');
    expect(stepTime('23:30:00', 1)).toBe('00:00:00');
    expect(stepTime('00:00:00', -1)).toBe('23:30:00');
  });
  test('waking hours keep start before end', () => {
    expect(canStepWaking('09:00:00', '21:00:00')).toBe(true);
    expect(canStepWaking('20:30:00', '21:00:00')).toBe(true);
    expect(canStepWaking('21:00:00', '21:00:00')).toBe(false);
  });
});

describe('timezone search', () => {
  const all = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London'];
  test('matches any part, underscores as spaces', () => {
    expect(filterTimezones(all, 'los angeles')).toEqual(['America/Los_Angeles']);
    expect(filterTimezones(all, 'europe')).toEqual(['Europe/London']);
    expect(filterTimezones(all, '')).toEqual(all);
    expect(filterTimezones(all, 'nowhere')).toEqual([]);
  });
});
