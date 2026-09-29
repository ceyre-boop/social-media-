import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type Breakpoint = 'compact' | 'medium' | 'wide';

export const COLUMN_MAX_WIDTH = 600;
export const SIDEBAR_COLLAPSED = 72;
export const SIDEBAR_EXPANDED = 240;
export const RAIL_WIDTH = 320;

export function breakpointFor(width: number): Breakpoint {
  if (width < 768) return 'compact';
  if (width < 1200) return 'medium';
  return 'wide';
}

/** compact < 768, medium 768-1199, wide >= 1200. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return breakpointFor(width);
}

/** Max width of the whole shell (sidebar + column + rail) so it centers as one group. */
export const SHELL_MAX_WIDTH: Record<Exclude<Breakpoint, 'compact'>, number> = {
  medium: SIDEBAR_COLLAPSED + COLUMN_MAX_WIDTH,
  wide: SIDEBAR_EXPANDED + COLUMN_MAX_WIDTH + RAIL_WIDTH,
};

export const NAV_HEIGHT = 64;
export const NAV_GAP = 12;

/** Bottom padding non-feed screens need on compact so content clears the floating pill nav. */
export function useNavClearance(): number {
  const compact = useBreakpoint() === 'compact';
  const insets = useSafeAreaInsets();
  return compact ? insets.bottom + NAV_GAP + NAV_HEIGHT + NAV_GAP : 0;
}
