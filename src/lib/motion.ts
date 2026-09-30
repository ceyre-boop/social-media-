import { Easing } from 'react-native-reanimated';

import { motion } from './theme';

const [sx1, sy1, sx2, sy2] = motion.easing.standard;
const [ex1, ey1, ex2, ey2] = motion.easing.emphasized;

/** Reanimated easing curves built from the theme's bezier tokens. */
export const easings = {
  standard: Easing.bezier(sx1, sy1, sx2, sy2),
  emphasized: Easing.bezier(ex1, ey1, ex2, ey2),
};

export { useReducedMotion } from './theme';
