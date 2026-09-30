import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { Avatar, TabBar, TabBarItem } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

import { navState } from './nav';

type ItemProps = TabTriggerSlotProps & {
  label: string;
  active: boolean;
  emphasized?: boolean;
  children: React.ReactNode;
};

function Item({ isFocused: _f, ...props }: ItemProps) {
  return <TabBarItem {...props} />;
}

/**
 * Compact-only floating pill nav, overlaying every (app) screen: Home, Discover, Create, Live, You.
 * Icons only (labels are spoken), no badges, no counts.
 */
export function FloatingNav({ pathname }: { pathname: string }) {
  const { profile } = useAuth();
  const { stage } = useTheme();
  const s = navState(pathname);

  return (
    <TabBar>
      <TabTrigger name="index" asChild>
        <Item label="Home" active={s.home}>
          <Ionicons name={s.home ? 'home' : 'home-outline'} size={24} color={stage.text} />
        </Item>
      </TabTrigger>
      <TabTrigger name="discover" asChild>
        <Item label="Discover" active={s.discover}>
          <Ionicons
            name={s.discover ? 'compass' : 'compass-outline'}
            size={25}
            color={stage.text}
          />
        </Item>
      </TabTrigger>
      <TabTrigger name="create" asChild>
        <Item label="Create" active={s.create} emphasized>
          <Ionicons name="add" size={30} color={stage.onPrimary} />
        </Item>
      </TabTrigger>
      <TabTrigger name="live" asChild>
        <Item label="Live" active={s.live}>
          <Ionicons name={s.live ? 'radio' : 'radio-outline'} size={25} color={stage.text} />
        </Item>
      </TabTrigger>
      <TabTrigger name="you" asChild>
        <Item label="You" active={s.you}>
          {profile ? (
            <Avatar username={profile.username} displayName={profile.display_name} size="sm" />
          ) : (
            <Ionicons name="person-outline" size={24} color={stage.text} />
          )}
        </Item>
      </TabTrigger>
    </TabBar>
  );
}
