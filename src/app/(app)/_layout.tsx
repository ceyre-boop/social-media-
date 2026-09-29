import { Stack } from 'expo-router';

import { RouteError } from '@/components/RouteError';
import { useAuth } from '@/lib/auth';

export { RouteError as ErrorBoundary };

export default function AppLayout() {
  const { profile } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!profile}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
