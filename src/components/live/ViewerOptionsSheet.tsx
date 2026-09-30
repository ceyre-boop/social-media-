import { Switch, View } from 'react-native';

import type { GiftMotion } from '@/components/gifts';
import { Button, SegmentedControl, Sheet, Text } from '@/components/ui';
import type { Segment } from '@/components/ui';
import { LEVEL_COPY } from '@/lib/contentFilter/copy';
import type { SpeechLevel } from '@/lib/contentFilter/types';
import { useTheme } from '@/lib/theme';

const LEVEL_ICON: Record<SpeechLevel, Segment<SpeechLevel>['icon']> = {
  family: 'happy-outline',
  standard: 'chatbubble-outline',
  open: 'flame-outline',
  max: 'skull-outline',
};

const SEGMENTS: Segment<GiftMotion>[] = [
  { value: 'full', label: 'Full', icon: 'sparkles' },
  { value: 'calm', label: 'Calm', icon: 'leaf' },
  { value: 'minimal', label: 'Minimal', icon: 'remove-circle-outline' },
];

const HELP: Record<GiftMotion, string> = {
  full: 'Every gift plays as designed.',
  calm: 'Half-size, no confetti, no full-screen takeovers.',
  minimal: 'Every gift shows as a small card. Nothing else moves.',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  motion: GiftMotion;
  onMotion: (m: GiftMotion) => void;
  hostCap: boolean;
  onHostCap: (v: boolean) => void;
  onTryGifts: () => void;
  /** The viewer's own speech level (null while it loads). */
  level: SpeechLevel | null;
  /** The levels this viewer may pick (minors: Family, Standard). */
  levels: SpeechLevel[];
  onLevel: (l: SpeechLevel) => void;
};

/**
 * Viewer options: what you see in chat (your speech level, a quick switch for the Settings dial),
 * gift animation size (Full / Calm / Minimal), the preview demo, host menu stub.
 */
export function ViewerOptionsSheet({
  visible,
  onClose,
  motion,
  onMotion,
  hostCap,
  onHostCap,
  onTryGifts,
  level,
  levels,
  onLevel,
}: Props) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Viewer options" scroll>
      <View style={{ gap: spacing.xl }}>
        {level ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="callout">What you see in chat</Text>
            <SegmentedControl
              label="What you see in chat"
              segments={levels.map((l) => ({ value: l, label: LEVEL_COPY[l].label, icon: LEVEL_ICON[l] }))}
              value={level}
              onChange={onLevel}
            />
            <Text variant="caption" tone="muted">
              {`${LEVEL_COPY[level].line} You never see more than this room allows. Same setting as Settings › Safety.`}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text variant="callout">Gift animations</Text>
          <SegmentedControl
            label="Gift animation size"
            segments={SEGMENTS}
            value={motion}
            onChange={onMotion}
          />
          <Text variant="caption" tone="muted">
            {`${HELP[motion]} Saved on this device. Calm is the default when your phone asks for reduced motion.`}
          </Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="callout">Preview</Text>
          <Button
            title="Try gifts"
            icon="gift"
            variant="secondary"
            onPress={() => {
              onClose();
              onTryGifts();
            }}
          />
          <Text variant="caption" tone="muted">
            Plays a scripted run: combos, a Glow that follows the creator, a Burst, a Shower, a
            Sunrise, then ten quick gifts at once.
          </Text>
        </View>

        <View
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text variant="caption" tone="muted" weight="700">
            HOST MENU (PREVIEW)
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="callout">Cap incoming animation size</Text>
              <Text variant="caption" tone="muted">
                Creators can keep gifts small on their own stream. Stub setting.
              </Text>
            </View>
            <Switch
              value={hostCap}
              onValueChange={onHostCap}
              accessibilityLabel="Cap incoming animation size"
              trackColor={{ false: colors.surface3, true: colors.textSecondary }}
              thumbColor={colors.surface}
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}
