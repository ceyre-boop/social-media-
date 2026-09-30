import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, PageTitle } from '@/components/ui';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

/** Placeholder: the live viewer is built in a later pass. */
export default function LiveViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        title="Stream preview"
        message={`The live viewer for ${id ?? 'this stream'} isn't built yet.`}
        actionLabel="Back to Live"
        onAction={() => router.navigate('/live')}
      />
    </View>
  );
}
