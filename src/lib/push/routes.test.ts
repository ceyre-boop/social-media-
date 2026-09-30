import { describe, expect, test } from 'bun:test';

import { NOTIFICATION_TYPES } from './copy';
import { routeForNotification } from './routes';

describe('notification routes', () => {
  test('a moment prompt opens the camera, whenever it is tapped (no expiry)', () => {
    expect(routeForNotification('moment_prompt')).toBe('/moments/new');
  });

  test('friend notifications open Add friends', () => {
    expect(routeForNotification('friend_request')).toBe('/friends');
    expect(routeForNotification('friend_accepted')).toBe('/friends');
  });

  test('every other or unknown type just opens the app', () => {
    for (const t of NOTIFICATION_TYPES) {
      if (t === 'moment_prompt' || t === 'friend_request' || t === 'friend_accepted') continue;
      expect(routeForNotification(t)).toBeNull();
    }
    expect(routeForNotification(undefined)).toBeNull();
    expect(routeForNotification('nope')).toBeNull();
  });
});
