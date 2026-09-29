import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { NAV_GAP, NAV_HEIGHT } from '@/lib/layout';
import { palettes } from '@/lib/theme';

const c = palettes.dark;
const ACTIVE_BG = 'rgba(255,255,255,0.16)';

type ItemProps = TabTriggerSlotProps & {
  label: string;
  active: boolean;
  children: React.ReactNode;
  emphasized?: boolean;
};

function Item({ label, active, children, emphasized, isFocused: _f, ...props }: ItemProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.hit}
    >
      <View
        style={[
          styles.pill,
          active && { backgroundColor: ACTIVE_BG },
          emphasized && !active && { backgroundColor: c.primary },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

/**
 * Compact-only floating pill nav, overlaying every (app) screen. Always dark and translucent
 * (blurred on web), independent of theme, so it reads over media and over plain screens.
 */
export function FloatingNav({ pathname }: { pathname: string }) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const feed = pathname === '/';
  const isNew = pathname === '/new';
  const isProfile = pathname.startsWith('/profile');

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + NAV_GAP }]}>
      <View accessibilityRole="tablist" style={[styles.nav, blur]}>
        <TabTrigger name="index" asChild>
          <Item label="Feed" active={feed}>
            <Ionicons name={feed ? 'home' : 'home-outline'} size={26} color="#FFFFFF" />
          </Item>
        </TabTrigger>
        <TabTrigger name="new" asChild>
          <Item label="New post" active={isNew} emphasized>
            <Ionicons name="add" size={28} color={isNew ? '#FFFFFF' : c.onPrimary} />
          </Item>
        </TabTrigger>
        <TabTrigger name="profile" asChild>
          <Item label="Profile" active={isProfile}>
            {profile ? (
              <Avatar username={profile.username} displayName={profile.display_name} size={30} />
            ) : (
              <Ionicons name="person-outline" size={26} color="#FFFFFF" />
            )}
          </Item>
        </TabTrigger>
      </View>
    </View>
  );
}

// backdropFilter is web-only and not in RN's style types.
const blur = { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as object;

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  nav: {
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(20,18,24,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hit: {
    minWidth: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pill: {
    width: 56,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
