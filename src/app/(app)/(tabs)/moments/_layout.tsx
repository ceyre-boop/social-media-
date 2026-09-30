import { Stack } from 'expo-router';

import { useTheme } from '@/lib/theme';

/** Moments: today's list (index), the full-screen viewer (view) and the camera composer (new). */
export default function MomentsLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
