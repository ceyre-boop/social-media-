import { useGiftMotion } from '@/components/gifts/useGiftMotion';
import { ChoiceGroup, Group, SettingsPage } from '@/components/settings/parts';
import type { GiftMotion } from '@/components/gifts/motionMode';
import { Text } from '@/components/ui';

const MOTION: { value: GiftMotion; label: string; explain: string }[] = [
  {
    value: 'full',
    label: 'Full',
    explain: 'Gifts play their whole animation, including full-screen ones.',
  },
  {
    value: 'calm',
    label: 'Calm',
    explain: 'Gifts are half the size, with no full-screen takeover and no sparkles.',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    explain: 'Gifts show as a small card in the list. Nothing moves on the video.',
  },
];

export default function Accessibility() {
  const [motion, setMotion] = useGiftMotion();
  return (
    <SettingsPage title="Accessibility">
      <ChoiceGroup
        title="Gift motion"
        note="Saved on this device."
        options={MOTION}
        value={motion}
        onChange={setMotion}
      />
      <Group title="Reduce motion in the app">
        <Text style={{ padding: 16 }} variant="callout" tone="secondary">
          If your phone or computer is set to reduce motion, we follow it: everything fades instead
          of sliding or zooming, and gifts start on Calm. You can still pick any option above.
        </Text>
      </Group>
      <Group title="Text size">
        <Text style={{ padding: 16 }} variant="callout" tone="secondary">
          Text follows your device&apos;s text size. To make it bigger or smaller, change it in your
          phone&apos;s or browser&apos;s settings.
        </Text>
      </Group>
    </SettingsPage>
  );
}
