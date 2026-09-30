import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easings } from '@/lib/motion';
import { useReducedMotion, useTheme } from '@/lib/theme';

/**
 * The live indicator. The only looping animation in the app: a slow 1.6s breathe
 * (opacity only), and a steady dot under reduced motion.
 */
export function LiveDot({ size = 8 }: { size?: number }) {
  const { colors, motion } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      cancelAnimation(o);
      o.value = 1;
      return;
    }
    o.value = withRepeat(
      withTiming(0.45, { duration: motion.liveBreathe / 2, easing: easings.standard }),
      -1,
      true,
    );
    return () => cancelAnimation(o);
  }, [reduce, o, motion.liveBreathe]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.live },
        style,
      ]}
    />
  );
}
