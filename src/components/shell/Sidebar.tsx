import { TabTrigger } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';

import { Avatar, Brand, IconButton, LogoMark, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

import { CreateGlyph } from './CreateGlyph';
import { navState } from './nav';
import { NavItem } from './NavItem';

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
        {expanded ? <Brand size={32} /> : <LogoMark size={32} />}
      </View>

      <View
        style={{
          gap: spacing.xs,
          marginTop: spacing.md,
          alignItems: expanded ? 'stretch' : 'center',
        }}
      >
        <TabTrigger name="index" asChild>
          <NavItem label="Home" icon="home-outline" active={s.home} mode={mode} />
        </TabTrigger>
        <TabTrigger name="discover" asChild>
          <NavItem label="Discover" icon="compass-outline" active={s.discover} mode={mode} />
        </TabTrigger>
        <TabTrigger name="live" asChild>
          <NavItem label="Live" icon="radio-outline" active={s.live} mode={mode} />
        </TabTrigger>
        <TabTrigger name="you" asChild>
          <NavItem label="You" icon="person-outline" active={s.you} mode={mode} />
        </TabTrigger>
        <TabTrigger name="create" asChild>
          <NavItem
            label="Create"
            icon={(color) => <CreateGlyph color={color} />}
            active={s.create}
            mode={mode}
          />
        </TabTrigger>
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  userStack: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  username: { flex: 1 },
});
