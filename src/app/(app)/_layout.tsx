import { Stack } from 'expo-router';

import { InAppNudge } from '@/components/push/InAppNudge';
import { PushPermissionSheet } from '@/components/push/PushPermissionSheet';
import { RouteError } from '@/components/RouteError';
import { useAuth } from '@/lib/auth';
import { useNotificationRouting, usePushRegistration } from '@/lib/push';

export { RouteError as ErrorBoundary };

export default function AppLayout() {
  const { profile, session } = useAuth();
  // Registers only if permission was already granted; never prompts at launch.
  usePushRegistration(session?.user.id ?? null);
  useNotificationRouting(!!profile);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
      {profile ? <InAppNudge /> : null}
      <PushPermissionSheet />
    </>
  );
}
