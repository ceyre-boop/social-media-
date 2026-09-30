import { Ionicons } from '@expo/vector-icons';
import { TabTrigger } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { TabBar, TabBarItem } from '@/components/ui';
import { useTheme } from '@/lib/theme';

import { CreateGlyph, NAV_ICON_SIZE } from './CreateGlyph';
import { navState } from './nav';

type ItemProps = TabTriggerSlotProps & {
  label: string;
  active: boolean;
  children: React.ReactNode;
};

function Item({ isFocused: _f, ...props }: ItemProps) {
  return <TabBarItem {...props} />;
}

/**
 * Compact-only floating pill nav, overlaying every (app) screen: Home, Discover, Create, Live, You.
 * Icons only (labels are spoken), no badges, no counts. Same outline icons at one size and one
 * neutral color as the sidebar; active changes the color only.
 */
export function FloatingNav({ pathname }: { pathname: string }) {
  const { stage } = useTheme();
  const s = navState(pathname);
  const tint = (active: boolean) => (active ? stage.primary : stage.textSecondary);
  const icon = (name: keyof typeof Ionicons.glyphMap, active: boolean) => (
    <Ionicons name={name} size={NAV_ICON_SIZE} color={tint(active)} />
  );

  return (
    <TabBar>
      <TabTrigger name="index" asChild>
        <Item label="Home" active={s.home}>
          {icon('home-outline', s.home)}
        </Item>
      </TabTrigger>
      <TabTrigger name="discover" asChild>
        <Item label="Discover" active={s.discover}>
          {icon('compass-outline', s.discover)}
        </Item>
      </TabTrigger>
      <TabTrigger name="create" asChild>
        <Item label="Create" active={s.create}>
          <CreateGlyph color={tint(s.create)} />
        </Item>
      </TabTrigger>
      <TabTrigger name="live" asChild>
        <Item label="Live" active={s.live}>
          {icon('radio-outline', s.live)}
        </Item>
      </TabTrigger>
      <TabTrigger name="you" asChild>
        <Item label="You" active={s.you}>
          {icon('person-outline', s.you)}
        </Item>
      </TabTrigger>
    </TabBar>
  );
}
