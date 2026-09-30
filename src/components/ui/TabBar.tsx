import { Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_GAP, NAV_HEIGHT } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

// backdropFilter is web-only and not in RN's style types.
const blur = { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as object;

/**
 * The floating pill: dark translucent glass on the fixed stage palette (independent of theme),
 * so it reads over media and over plain screens. Presentational; the shell supplies items.
 */
export function TabBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { stage, radius, elevation } = useTheme();
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + NAV_GAP }]}>
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          blur,
          elevation[2],
          {
            borderRadius: radius.pill,
            backgroundColor: stage.glass,
            borderColor: stage.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

type ItemProps = PressableProps & {
  /** Spoken label. Labels are never drawn on the phone pill. */
  label: string;
  active: boolean;
  children: React.ReactNode;
};

/** One pill item. Spread trigger props (from expo-router's TabTrigger asChild) onto it. */
export function TabBarItem({ label, active, children, ...props }: ItemProps) {
  const { stage, radius } = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.hit}
    >
      {(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return (
          <View
            style={[
              styles.pill,
              {
                borderRadius: radius.pill,
                // Active is color-only (the icon); the disc appears on hover/press feedback alone.
                backgroundColor: hovered || state.pressed ? stage.control : 'transparent',
              },
            ]}
          >
            {children}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  bar: {
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '96%',
  },
  hit: {
    minWidth: 48,
    minHeight: 56,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pill: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
