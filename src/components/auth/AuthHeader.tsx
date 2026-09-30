import { StyleSheet, View } from 'react-native';

import { LogoMark, Text } from '@/components/ui';

/** Logo mark + title (+ optional supporting line), centered. Used at the top of every auth screen. */
export function AuthHeader({
  title,
  subtitle,
  logo = 64,
}: {
  title: string;
  subtitle?: string;
  logo?: number;
}) {
  return (
    <View style={styles.header}>
      <LogoMark size={logo} />
      <Text accessibilityRole="header" variant="title" align="center">
        {title}
      </Text>
      {subtitle ? (
        <Text tone="secondary" align="center">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 12, marginBottom: 8 },
});
