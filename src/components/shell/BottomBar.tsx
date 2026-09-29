import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

import { NavItem } from './NavItem';

function NewButton({ isFocused: _f, ...props }: TabTriggerSlotProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel="New post"
      style={styles.newWrap}
    >
      <View
        style={[styles.newButton, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

export function BottomBar({ pathname }: { pathname: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
        },
      ]}
    >
      <TabTrigger name="index" asChild>
        <NavItem
          label="Feed"
          icon="home-outline"
          activeIcon="home"
          active={pathname === '/'}
          mode="bar"
        />
      </TabTrigger>
      <TabTrigger name="new" asChild>
        <NewButton />
      </TabTrigger>
      <TabTrigger name="profile" asChild>
        <NavItem
          label="Profile"
          icon="person-outline"
          activeIcon="person"
          active={pathname.startsWith('/profile')}
          mode="bar"
        />
      </TabTrigger>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  newWrap: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  newButton: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
});
