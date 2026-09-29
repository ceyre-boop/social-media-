import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/lib/theme';

/** Heart toggle: outline to filled pink with a small scale pop. Deliberately no count. */
export function LikeButton({ liked, onPress }: { liked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!liked) return;
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 120, useNativeDriver: native }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: native }),
    ]).start();
  }, [liked, scale]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
      accessibilityState={{ selected: liked }}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.base,
          { backgroundColor: hovered || state.pressed ? colors.surface2 : 'transparent' },
        ];
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={26}
          color={liked ? colors.primary : colors.text}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
});
