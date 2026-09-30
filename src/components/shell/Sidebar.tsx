import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Brand, IconButton, LogoMark, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

import { navState } from './nav';
import { NavItem } from './NavItem';

/** Create: the prominent button, not a plain nav row. */
function CreateButton({
  collapsed,
  active,
  isFocused: _f,
  ...props
}: TabTriggerSlotProps & { collapsed: boolean; active: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="link"
      accessibilityLabel="Create"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.createButton,
          collapsed && styles.createButtonCollapsed,
          {
            borderRadius: collapsed ? radius.pill : radius.md,
            backgroundColor: state.pressed || hovered ? colors.primaryPressed : colors.primary,
          },
        ];
      }}
    >
      <Ionicons name="add" size={26} color={colors.onPrimary} />
      {collapsed ? null : (
        <Text variant="callout" weight="800" tone="onPrimary" style={{ fontSize: 16 }}>
          Create
        </Text>
      )}
    </Pressable>
  );
}

export function Sidebar({ expanded, pathname }: { expanded: boolean; pathname: string }) {
  const { colors, spacing } = useTheme();
  const { profile, signOut } = useAuth();
  const mode = expanded ? 'side' : 'side-collapsed';
  const s = navState(pathname);

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
          <NavItem label="Home" icon="home-outline" activeIcon="home" active={s.home} mode={mode} />
        </TabTrigger>
        <TabTrigger name="discover" asChild>
          <NavItem
            label="Discover"
            icon="compass-outline"
            activeIcon="compass"
            active={s.discover}
            mode={mode}
          />
        </TabTrigger>
        <TabTrigger name="live" asChild>
          <NavItem
            label="Live"
            icon="radio-outline"
            activeIcon="radio"
            active={s.live}
            mode={mode}
          />
        </TabTrigger>
        <TabTrigger name="you" asChild>
          <NavItem
            label="You"
            icon="person-outline"
            activeIcon="person"
            active={s.you}
            mode={mode}
          />
        </TabTrigger>
        <View style={{ marginTop: spacing.md }}>
          <TabTrigger name="create" asChild>
            <CreateButton collapsed={!expanded} active={s.create} />
          </TabTrigger>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {profile ? (
        <View
          style={[
            expanded ? styles.userRow : styles.userStack,
            { borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
          ]}
        >
          <Avatar username={profile.username} displayName={profile.display_name} size="md" />
          {expanded ? (
            <Text variant="caption" weight="600" numberOfLines={1} style={styles.username}>
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
  createButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  createButtonCollapsed: { width: 48 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  userStack: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  username: { flex: 1 },
});
