import { useWindowDimensions } from 'react-native';

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
