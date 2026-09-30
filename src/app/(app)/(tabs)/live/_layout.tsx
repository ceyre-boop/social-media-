import { Stack } from 'expo-router';

import { useTheme } from '@/lib/theme';

/** Live tab: directory (index) with the viewer ([id]) pushed on top. */
export default function LiveLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
