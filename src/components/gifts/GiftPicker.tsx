import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Sheet, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import type { GiftTierName } from '@/lib/theme';

import { BLIP_RATE, TIERS, formatBlips, giftsInTier, tierInfo } from './catalog';
import type { Gift } from './catalog';
import { GiftIcon } from './GiftIcon';

type Props = { visible: boolean; onClose: () => void; onSelect: (gift: Gift) => void };

/**
 * Gift picker in a Sheet: a tab per tier, a grid of gift tiles (icon, name, blips). Tapping a
 * gift only plays its animation. No balance, purchase or ledger; the rate is stated openly.
 */
export function GiftPicker({ visible, onClose, onSelect }: Props) {
  const { colors, radius, spacing } = useTheme();
  const [tier, setTier] = useState<GiftTierName>('blips');
  const info = tierInfo(tier);
  const gifts = giftsInTier(tier);

  return (
    <Sheet visible={visible} onClose={onClose} title="Send a gift" scroll>
      <View style={{ gap: spacing.lg }}>
        <Text variant="caption" tone="secondary">
          {BLIP_RATE}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          contentContainerStyle={{ gap: spacing.sm }}
          style={{ flexGrow: 0 }}
        >
          {TIERS.map((t) => {
            const active = t.id === tier;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTier(t.id)}
                style={(state) => {
                  const hovered = (state as { hovered?: boolean }).hovered;
                  return {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    minHeight: 44,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: active ? t.accent : colors.border,
                    backgroundColor: active
                      ? colors.surface3
                      : hovered || state.pressed
                        ? colors.surface2
                        : colors.surface,
                    cursor: 'pointer',
                  };
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: radius.pill,
                    backgroundColor: t.accent,
                  }}
                />
                <Text variant="callout" tone={active ? 'default' : 'secondary'}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View accessibilityRole="header" style={{ gap: 2 }}>
          <Text variant="headline">{info.label}</Text>
          <Text variant="caption" tone="muted">
            {info.blurb} · {info.range} · {info.presence}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {gifts.map((gift) => (
            <Pressable
              key={gift.id}
              accessibilityRole="button"
              accessibilityLabel={`${gift.name}, ${formatBlips(gift.blips)}`}
              onPress={() => onSelect(gift)}
              style={(state) => {
                const hovered = (state as { hovered?: boolean }).hovered;
                return {
                  width: '31.5%',
                  minWidth: 92,
                  flexGrow: 1,
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.xs,
                  borderRadius: radius.lg,
                  backgroundColor: state.pressed
                    ? colors.surface3
                    : hovered
                      ? colors.surface2
                      : 'transparent',
                  cursor: 'pointer',
                };
              }}
            >
              <GiftIcon gift={gift} size={64} />
              <Text variant="caption" align="center" numberOfLines={2}>
                {gift.name}
              </Text>
              <Text variant="caption" tone="muted">
                {formatBlips(gift.blips)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text variant="caption" tone="muted" align="center">
          {"Preview — gifting isn't live yet"}
        </Text>
      </View>
    </Sheet>
  );
}
