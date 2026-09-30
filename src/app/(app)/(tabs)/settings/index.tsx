import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import { Group, LinkRow } from '@/components/settings/parts';
import { AppBar, IconButton, Screen } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** Settings: six plain groups. Each opens one page; nothing goes deeper. */
export default function Settings() {
  const { colors } = useTheme();
  const router = useRouter();
  const go = (path: string) => router.push(path as Href);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title="Settings"
        left={
          <IconButton
            icon="chevron-back"
            label="Back to You"
            onPress={() => router.navigate('/you')}
          />
        }
      />
      <Screen title="Settings" scroll padded safeBottom={false} clearNav>
        <Group>
          <LinkRow
            first
            title="Account"
            explain="Your name, email, password, and your data."
            onPress={() => go('/settings/account')}
          />
          <LinkRow
            title="Notifications"
            explain="What we tell you about, and when we stay quiet."
            onPress={() => go('/settings/notifications')}
          />
          <LinkRow
            title="Privacy"
            explain="Who can ask to be your friend."
            onPress={() => go('/settings/privacy')}
          />
          <LinkRow
            title="Safety"
            explain="Live chat rules, people you trust, people you blocked."
            onPress={() => go('/settings/safety')}
          />
          <LinkRow
            title="Accessibility"
            explain="Motion and text size."
            onPress={() => go('/settings/accessibility')}
          />
          <LinkRow
            title="Support"
            explain="Get help, or ask us a question."
            onPress={() => go('/support')}
          />
        </Group>
      </Screen>
    </View>
  );
}
