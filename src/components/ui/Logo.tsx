import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/config/brand';
import { useTheme } from '@/lib/theme';

import { Text } from './Text';

/** Circular badge: the logo's black background reads as the badge itself. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const { stage } = useTheme();
  return (
    <Image
      source={require('../../../assets/images/logo-256.png')}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: stage.bg }}
      accessibilityLabel={`${brand.appName} logo`}
    />
  );
}

/** Neutral, light-weight wordmark: the logo mark carries the brand color, not the text. */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      variant="headline"
      weight="600"
      style={{ fontSize: size, lineHeight: size * 1.25 }}
    >
      {brand.appName}
    </Text>
  );
}

export function Brand({ size = 32 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <LogoMark size={size} />
      <Wordmark size={size * 0.56} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
