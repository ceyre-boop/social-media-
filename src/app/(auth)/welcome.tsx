import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthNotice } from '@/components/auth/AuthNotice';
import { Button, LogoMark, Screen, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';

/** The signed-out landing: who we are in one line, then Create account / Log in. */
export default function Welcome() {
  const { notice } = useAuth();
  return (
    <Screen title="Welcome" scroll center maxWidth={420} padded safeTop safeBottom>
      <View style={styles.header}>
        <LogoMark size={96} />
        <Text accessibilityRole="header" variant="display" align="center">
          {brand.appName}
        </Text>
        <Text variant="headline" weight="600" tone="secondary" align="center">
          Built for the real ones.
        </Text>
      </View>

      {notice ? <AuthNotice>{notice}</AuthNotice> : null}

      <View style={styles.actions}>
        <Button title="Create account" size="lg" onPress={() => router.push('/sign-up')} />
        <Button
          title="Log in"
          size="lg"
          variant="secondary"
          onPress={() => router.push('/log-in')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 12, marginBottom: 16 },
  actions: { gap: 12 },
});
