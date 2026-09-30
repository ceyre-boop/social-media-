import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, PageTitle } from '@/components/ui';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

/** Placeholder: the live directory is built in a later pass. */
export default function LiveDirectory() {
  const router = useRouter();
  const clearance = useNavClearance();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: colors.bg,
        paddingBottom: clearance,
      }}
    >
      <PageTitle title="Live" />
      <EmptyState
        title="Live is coming"
        message="Soon you'll find people going live here, and you can too."
        actionLabel="Back to Home"
        onAction={() => router.navigate('/')}
      />
    </View>
  );
}
