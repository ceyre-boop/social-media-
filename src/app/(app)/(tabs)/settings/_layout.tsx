import { Stack } from 'expo-router';

import { useTheme } from '@/lib/theme';

/** Settings: the list of groups (index) and one page per group. Never deeper than that. */
export default function SettingsLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
