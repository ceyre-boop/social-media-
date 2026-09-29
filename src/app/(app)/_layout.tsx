import { Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function AppLayout() {
  const { profile } = useAuth();

  return (
    <Stack>
      <Stack.Protected guard={!profile}>
        <Stack.Screen
          name="onboarding"
          options={{ title: 'Create your profile', headerBackVisible: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!!profile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile-edit" options={{ title: 'Edit profile' }} />
      </Stack.Protected>
    </Stack>
  );
}
