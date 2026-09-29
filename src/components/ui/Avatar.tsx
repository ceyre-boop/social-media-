import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { tintFor, useTheme } from '@/lib/theme';

type Props = {
  username: string;
  displayName?: string | null;
  uri?: string | null;
  size?: number;
};

function initialsOf(username: string, displayName?: string | null): string {
  const source = (displayName?.trim() || username).replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? '?').slice(0, 2).toUpperCase();
}

/** Image if the avatar exists, otherwise initials on a rainbow tint hashed from the username. */
export function Avatar({ username, displayName, uri, size = 40 }: Props) {
  const { colors } = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[box, { backgroundColor: colors.surface2 }]} />;
  }
  return (
    <View
      style={[styles.fallback, box, { backgroundColor: tintFor(username) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: '#1A0710' }}>
        {initialsOf(username, displayName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
