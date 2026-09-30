import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { brand } from '@/config/brand';
import { RouteError } from '@/components/RouteError';
import { StatusScreen } from '@/components/status-screen';
import { Button, ToastProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { configMissing, pingServer, supabaseUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export { RouteError as ErrorBoundary };

// Hold the splash until Plus Jakarta Sans is ready so text never flashes in a fallback face.
void SplashScreen.preventAutoHideAsync().catch(() => {});

type ServerState = 'checking' | 'ok' | 'down';

function RootStack() {
  const { loading, session, profile, profileError, refreshProfile, signOut } = useAuth();
  const { colors } = useTheme();
  const [server, setServer] = useState<ServerState>(configMissing ? 'ok' : 'checking');

  const check = useCallback(() => {
    setServer('checking');
    void pingServer().then((ok) => setServer(ok ? 'ok' : 'down'));
  }, []);

  useEffect(() => {
    if (configMissing) return;
    let live = true;
    void pingServer().then((ok) => live && setServer(ok ? 'ok' : 'down'));
    return () => {
      live = false;
    };
  }, []);

  if (configMissing) {
    return (
      <StatusScreen
        title={`${brand.appName} isn't set up yet`}
        message="This build is missing its server settings."
        detail={
          __DEV__
            ? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example and the README), then restart Expo.'
            : undefined
        }
      />
    );
  }

  if (server === 'down') {
    return (
      <StatusScreen
        title="Can't reach the server"
        message={`We couldn't connect to ${supabaseUrl}. Check your connection and try again.`}
        detail={
          __DEV__
            ? "Dev hint: on a phone, 127.0.0.1 is the phone itself. Set EXPO_PUBLIC_SUPABASE_URL to your computer's LAN IP (for example http://192.168.1.20:54321), restart Expo, and see the README."
            : undefined
        }
      >
        <Button title="Retry" onPress={check} />
      </StatusScreen>
    );
  }

  if (loading || server === 'checking') {
    return <StatusScreen title={brand.appName} spinner />;
  }

  // A failed profile fetch must not look like "no profile" (that would route to onboarding).
  if (session && !profile && profileError) {
    return (
      <StatusScreen
        title={profileError.title}
        message={profileError.message}
        detail={__DEV__ ? profileError.detail : undefined}
      >
        <Button title="Retry" onPress={refreshProfile} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </StatusScreen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // A font error still renders (the web fallback stack / system font takes over).
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="auto" />
          <RootStack />
        </ToastProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
