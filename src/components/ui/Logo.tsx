import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

/** Circular badge: the logo's black background reads as the badge itself. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../../assets/images/logo-256.png')}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000' }}
      accessibilityLabel="Smiley logo"
    />
  );
}

/** Solid pink wordmark (no gradient: that needs a dependency). */
export function Wordmark({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.word, { fontSize: size, color: colors.primary }]}
    >
      Smiley
    </Text>
  );
}

export function Brand({ size = 32 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <LogoMark size={size} />
      <Wordmark size={size * 0.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontWeight: '900', letterSpacing: 0.5 },
});
