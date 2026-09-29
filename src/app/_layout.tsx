import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Centered } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

function RootStack() {
  const { loading, session, profile, profileError, refreshProfile, signOut } = useAuth();

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  // A failed profile fetch must not look like "no profile" (that would route to onboarding).
  if (session && !profile && profileError) {
    return (
      <Centered>
        <View style={{ gap: 12, padding: 24, alignSelf: 'stretch' }}>
          <Text style={{ textAlign: 'center' }}>
            Could not load your profile. Check your connection.
          </Text>
          <Button title="Retry" onPress={refreshProfile} />
          <Button title="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </Centered>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
