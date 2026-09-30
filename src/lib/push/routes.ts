/**
 * Where tapping a notification (a push, or the in-app nudge) takes you. Dependency-free so it is
 * unit-tested. Null = just open the app where it was.
 */
import type { NotificationType } from './copy';

export function routeForNotification(type: unknown): string | null {
  switch (type as NotificationType) {
    case 'moment_prompt':
      return '/moments/new';
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    default:
      return null;
  }
}
