import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Brand, IconButton, LogoMark } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

import { NavItem } from './NavItem';

function NewPostButton({
  collapsed,
  isFocused: _f,
  ...props
}: TabTriggerSlotProps & { collapsed: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="link"
      accessibilityLabel="New post"
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.newButton,
          collapsed && styles.newButtonCollapsed,
          {
            borderRadius: collapsed ? radius.pill : radius.md,
            backgroundColor: state.pressed || hovered ? colors.primaryPressed : colors.primary,
          },
        ];
      }}
    >
      <Ionicons name="add" size={26} color={colors.onPrimary} />
      {collapsed ? null : (
        <Text style={[styles.newLabel, { color: colors.onPrimary }]}>New post</Text>
      )}
    </Pressable>
  );
}

export function Sidebar({ expanded, pathname }: { expanded: boolean; pathname: string }) {
  const { colors, spacing } = useTheme();
  const { profile, signOut } = useAuth();
  const mode = expanded ? 'side' : 'side-collapsed';

  return (
    <View
      role="navigation"
      style={[
        styles.side,
        {
          width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
          padding: spacing.md,
          borderRightColor: colors.border,
          backgroundColor: colors.bg,
          alignItems: expanded ? 'stretch' : 'center',
        },
      ]}
    >
      <View style={{ paddingHorizontal: expanded ? 8 : 0, paddingVertical: spacing.md }}>
        {expanded ? <Brand size={40} /> : <LogoMark size={40} />}
      </View>

      <View
        style={{
          gap: spacing.xs,
          marginTop: spacing.md,
          alignItems: expanded ? 'stretch' : 'center',
        }}
      >
        <TabTrigger name="index" asChild>
          <NavItem
            label="Feed"
            icon="home-outline"
            activeIcon="home"
            active={pathname === '/'}
            mode={mode}
          />
        </TabTrigger>
        <TabTrigger name="profile" asChild>
          <NavItem
            label="Profile"
            icon="person-outline"
            activeIcon="person"
            active={pathname.startsWith('/profile')}
            mode={mode}
          />
        </TabTrigger>
        <View style={{ marginTop: spacing.md }}>
          <TabTrigger name="new" asChild>
            <NewPostButton collapsed={!expanded} />
          </TabTrigger>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {profile ? (
        <View
          style={[
            expanded ? styles.userRow : styles.userStack,
            { borderTopColor: colors.border, paddingTop: spacing.md },
          ]}
        >
          <Avatar username={profile.username} displayName={profile.display_name} size={40} />
          {expanded ? (
            <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>
              @{profile.username}
            </Text>
          ) : null}
          <IconButton
            icon="log-out-outline"
            label="Sign out"
            onPress={signOut}
            color={colors.muted}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  side: { height: '100%', borderRightWidth: StyleSheet.hairlineWidth },
  newButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  newButtonCollapsed: { width: 48 },
  newLabel: { fontSize: 16, fontWeight: '800' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  userStack: { alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  username: { flex: 1, fontSize: 14, fontWeight: '600' },
});
