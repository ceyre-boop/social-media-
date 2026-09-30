/**
 * iOS / Android push plumbing (expo-notifications). The web build uses device.ts instead.
 * Nothing here ever asks for permission on its own: askPermission() is called only from
 * requestPushPermission(), after the in-context explainer sheet.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const pushSupported = true;

let configured = false;

/** Foreground presentation + the Android channel. Safe to call repeatedly. */
export function configurePush(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function permissionState(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function askPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return status === 'granted';
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/** The Expo push token, or null when it can't exist here (simulator, no EAS project yet). */
export async function expoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const id = projectId();
  if (!id) {
    if (__DEV__) {
      console.warn(
        'push: no EAS projectId (expo.extra.eas.projectId). Run `bunx eas-cli init` to enable push; skipping registration.',
      );
    }
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return data;
}

/** Calls back when the OS rotates the device token (the Expo token must then be re-fetched). */
export function onTokenRotation(cb: () => void): () => void {
  const sub = Notifications.addPushTokenListener(() => cb());
  return () => sub.remove();
}

/**
 * Calls back with the notification `type` whenever the person taps a push: once for the tap that
 * cold-started the app (if any), then for every tap while it runs. Each response is handled once.
 */
export function onNotificationOpened(cb: (type: unknown) => void): () => void {
  let lastId: string | null = null;
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = r.notification.request.identifier;
    if (id === lastId) return;
    lastId = id;
    cb((r.notification.request.content.data as { type?: unknown } | undefined)?.type);
  };
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    handle(r);
    void Notifications.clearLastNotificationResponseAsync();
  });
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

export function platformName(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
