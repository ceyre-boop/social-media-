import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View } from 'react-native';

import { FloatingNav } from '@/components/shell/FloatingNav';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { Sidebar } from '@/components/shell/Sidebar';
import { COLUMN_MAX_WIDTH, SHELL_MAX_WIDTH, useBreakpoint } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

/**
 * One route tree, three shells. The headless <Tabs> owns navigation state; what surrounds
 * <TabSlot /> depends on the breakpoint:
 *   compact: content + bottom tab bar
 *   medium:  icon-only sidebar (72) + centered 600px column
 *   wide:    full sidebar (240) + centered 600px column (no persistent right rail)
 * The live viewer (/live/[id]) is immersive: no floating nav, sidebar, and the stage gets
 * the full window (it has its own back/close, and the gift takeover may not be covered).
 * The hidden <TabList> registers the routes; visible triggers are plain <TabTrigger name> elsewhere.
 */
export default function TabsLayout() {
  const bp = useBreakpoint();
  const { colors } = useTheme();
  const pathname = usePathname();
  const compact = bp === 'compact';
  const immersive = /^\/live\/[^/]+/.test(pathname);

  return (
    // Full-bleed backdrop so the margins around the centered shell match the app background.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        style={{
          flex: 1,
          flexDirection: compact ? 'column' : 'row',
          backgroundColor: colors.bg,
          // Sidebar + column sit together as one centered group instead of the sidebar
          // hugging the window edge with dead space before the column.
          ...(compact || immersive
            ? null
            : {
                width: '100%',
                maxWidth: SHELL_MAX_WIDTH[bp],
                alignSelf: 'center',
              }),
        }}
      >
        {compact || immersive ? null : <Sidebar expanded={bp === 'wide'} pathname={pathname} />}

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
          <View
            style={[
              { flex: 1, maxWidth: compact || immersive ? undefined : COLUMN_MAX_WIDTH },
              !compact &&
                !immersive && {
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderColor: colors.border,
                },
            ]}
          >
            {compact || immersive ? null : <OfflineBanner />}
            <View style={{ flex: 1 }}>
              {/* ScreenContainer defaults to flexShrink 0, which lets tall screens overflow the bar. */}
              <TabSlot style={{ flexShrink: 1, minHeight: 0 }} />
            </View>
          </View>
        </View>

        {compact && !immersive ? <OfflineBanner floating /> : null}
        {compact && !immersive ? <FloatingNav pathname={pathname} /> : null}

        <TabList style={{ display: 'none' }}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="discover" href="/discover" />
          <TabTrigger name="create" href="/create" />
          <TabTrigger name="live" href="/live" />
          <TabTrigger name="you" href="/you" />
          <TabTrigger name="profile-edit" href="/profile-edit" />
          <TabTrigger name="u/[username]" href="/u/[username]" />
          <TabTrigger name="post/[id]" href="/post/[id]" />
        </TabList>
      </Tabs>
    </View>
  );
}
