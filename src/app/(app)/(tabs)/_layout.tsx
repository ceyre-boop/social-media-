import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View } from 'react-native';

import { BottomBar } from '@/components/shell/BottomBar';
import { Rail } from '@/components/shell/Rail';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { Sidebar } from '@/components/shell/Sidebar';
import { COLUMN_MAX_WIDTH, SHELL_MAX_WIDTH, useBreakpoint } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

/**
 * One route tree, three shells. The headless <Tabs> owns navigation state; what surrounds
 * <TabSlot /> depends on the breakpoint:
 *   compact: content + bottom tab bar
 *   medium:  icon-only sidebar (72) + centered 600px column
 *   wide:    full sidebar (240) + centered 600px column + right rail (320)
 * The hidden <TabList> registers the routes; visible triggers are plain <TabTrigger name> elsewhere.
 */
export default function TabsLayout() {
  const bp = useBreakpoint();
  const { colors } = useTheme();
  const pathname = usePathname();
  const compact = bp === 'compact';

  return (
    // Full-bleed backdrop so the margins around the centered shell match the app background.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        style={{
          flex: 1,
          flexDirection: compact ? 'column' : 'row',
          backgroundColor: colors.bg,
          // Sidebar + column (+ rail) sit together as one centered group instead of the sidebar
          // hugging the window edge with dead space before the column.
          ...(compact
            ? null
            : {
                width: '100%',
                maxWidth: SHELL_MAX_WIDTH[bp],
                alignSelf: 'center',
              }),
        }}
      >
        {compact ? null : <Sidebar expanded={bp === 'wide'} pathname={pathname} />}

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
          <View
            style={[
              { flex: 1, maxWidth: compact ? undefined : COLUMN_MAX_WIDTH },
              !compact && {
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: colors.border,
              },
            ]}
          >
            {compact ? null : <OfflineBanner />}
            <View style={{ flex: 1 }}>
              {/* ScreenContainer defaults to flexShrink 0, which lets tall screens overflow the bar. */}
              <TabSlot style={{ flexShrink: 1, minHeight: 0 }} />
            </View>
          </View>
          {bp === 'wide' ? <Rail /> : null}
        </View>

        {compact ? <OfflineBanner /> : null}
        {compact ? <BottomBar pathname={pathname} /> : null}

        <TabList style={{ display: 'none' }}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="new" href="/new" />
          <TabTrigger name="profile" href="/profile" />
          <TabTrigger name="profile-edit" href="/profile-edit" />
        </TabList>
      </Tabs>
    </View>
  );
}
