/**
 * Single source of truth for every visual decision in the app.
 * This is the ONLY file allowed to contain color literals (enforced by ESLint).
 * Rules of use live in DESIGN.md.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

export type ColorScheme = 'dark' | 'light';

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export type Colors = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  muted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySubtle: string;
  /** Focus ring color. */
  focus: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** The LIVE tag / live dot. Never red. */
  live: string;
  /** Dims the page behind a sheet or dialog. */
  scrim: string;
  /** Translucent chip background laid over media or content. */
  overlay: string;
};

const dark: Colors = {
  bg: '#050506',
  surface: '#0F0F11',
  surface2: '#171719',
  surface3: '#222225',
  border: '#26262A',
  borderStrong: '#3B3B40',
  text: '#F4F4F5',
  textSecondary: '#BDBDC2',
  muted: '#93939A',
  primary: '#FF6FB5',
  primaryPressed: '#F0529F',
  onPrimary: '#24040F',
  primarySubtle: '#3A1A2B',
  focus: '#FF9CCB',
  success: '#4CD68A',
  warning: '#FFC24D',
  danger: '#FF6B6B',
  info: '#5CC8FF',
  live: '#FF4FA3',
  scrim: 'rgba(0,0,0,0.75)',
  overlay: 'rgba(5,5,6,0.55)',
};

// AA adjustments vs the brief (see DESIGN.md "Contrast"): primary, primaryPressed, success,
// warning, danger, info and live were darkened so that each passes 4.5:1 as text on
// bg/surface/surface2/primarySubtle and, for primary, as a fill under white text.
const light: Colors = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surface2: '#F2F2F3',
  surface3: '#E8E8EA',
  border: '#E4E4E7',
  borderStrong: '#CFCFD4',
  text: '#111113',
  textSecondary: '#46464C',
  muted: '#62626A',
  primary: '#BA3273',
  primaryPressed: '#9E2A62',
  onPrimary: '#FFFFFF',
  primarySubtle: '#FCE3EF',
  focus: '#8C1240',
  success: '#177844',
  warning: '#8F5E18',
  danger: '#BA3C3C',
  info: '#176EA6',
  live: '#BA3273',
  scrim: 'rgba(0,0,0,0.5)',
  overlay: 'rgba(250,250,250,0.7)',
};

export const palettes: Record<ColorScheme, Colors> = { dark, light };

/** Brand and delight colors. Theme-independent. Rainbow is for delight, never for chrome. */
export const brand = {
  pink: '#FF6FB5',
  maroon: '#8C1240',
  sun: '#FFD93B',
  tangerine: '#FF8A1F',
  magenta: '#FF3D9A',
  violet: '#B45CFF',
  sky: '#28C2F2',
  lime: '#5BD245',
  /** Text/ink that sits on any rainbow color (all pass AA). */
  onRainbow: '#24040F',
} as const;

/** Rainbow from the logo mane. Gifts, likes, celebrations, avatars only. */
export const rainbow = [
  brand.sun,
  brand.tangerine,
  brand.magenta,
  brand.violet,
  brand.sky,
  brand.lime,
] as const;

/**
 * Media surfaces (reels, live) are always dark, regardless of theme. Everything drawn over
 * video or photos reads from this set.
 */
export const stage = {
  bg: '#000000',
  surface: '#0F0F11',
  surface2: '#171719',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.82)',
  muted: '#B0B0B6',
  primary: '#FF6FB5',
  onPrimary: '#24040F',
  border: 'rgba(255,255,255,0.18)',
  /** Round control over media (like, more). */
  control: 'rgba(0,0,0,0.35)',
  controlHover: 'rgba(0,0,0,0.55)',
  /** Translucent dark glass: the floating nav pill. */
  glass: 'rgba(16,16,18,0.72)',
  glassActive: 'rgba(255,255,255,0.16)',
  scrimTop: 'rgba(0,0,0,0.5)',
  scrimBottom: 'rgba(0,0,0,0.78)',
  scrimClear: 'rgba(0,0,0,0)',
  dim: 'rgba(0,0,0,0.45)',
  /** Outline / fill of the Follow pill over media. */
  pillBorder: 'rgba(255,255,255,0.9)',
  pillFill: 'rgba(255,255,255,0.22)',
  /** Warm end-of-feed backdrop. */
  warmTop: '#3A1A2B',
  warmBottom: '#050506',
  textShadow: 'rgba(0,0,0,0.6)',
  /** Text-post card overlay. */
  cardTop: 'rgba(0,0,0,0.05)',
  cardBottom: 'rgba(20,10,30,0.72)',
} as const;

export type Stage = typeof stage;

/**
 * Gift tier palette (theme-independent). Anchored to the brand yellow, cream and near-black;
 * each tier may use a wider accent range than the one below it: The entry tier speaks only in yellow,
 * Sunrise uses the whole warm spectrum. `accent` fills the gift tile (ink on it is
 * `giftInk`); `range` colors confetti, sparks and light in that tier's animation.
 */
export const giftInk = brand.onRainbow;
export const giftCream = '#FFF3D6';

export const giftTier = {
  entry: { accent: brand.sun, range: [brand.sun] },
  sparks: { accent: brand.tangerine, range: [brand.sun, brand.tangerine] },
  glows: { accent: brand.magenta, range: [brand.sun, brand.tangerine, brand.magenta] },
  bursts: {
    accent: brand.violet,
    range: [brand.sun, brand.tangerine, brand.magenta, brand.violet],
  },
  showers: {
    accent: brand.sky,
    range: [brand.sun, brand.tangerine, brand.magenta, brand.violet, brand.sky],
  },
  sunrise: { accent: brand.pink, range: [brand.pink, ...rainbow] },
} as const;

export type GiftTierName = keyof typeof giftTier;

/** Names of the brand colors, for token-referenced gradients (live thumbnails). */
export type BrandColorName = Exclude<keyof typeof brand, 'onRainbow'>;

/** Stable rainbow tint from a name (avatars, text-post cards). */
export function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return rainbow[h % rainbow.length];
}

// ---------------------------------------------------------------------------
// Spacing, radius
// ---------------------------------------------------------------------------

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

// ---------------------------------------------------------------------------
// Typography (Plus Jakarta Sans)
// ---------------------------------------------------------------------------

export type FontWeight = '400' | '500' | '600' | '700' | '800';

/** Names registered by useFonts() in the root layout. */
export const fontFamilies: Record<FontWeight, string> = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
};

const WEB_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** fontFamily for a weight. Web appends a system fallback stack so text never disappears. */
export function fontFamilyFor(weight: FontWeight): string {
  const name = fontFamilies[weight];
  return Platform.OS === 'web' ? `${name}, ${WEB_FALLBACK}` : name;
}

export type TypeVariant = 'display' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'micro';

export type TypeToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  letterSpacing: number;
  textTransform?: TextStyle['textTransform'];
};

export const type: Record<TypeVariant, TypeToken> = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: 0 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
};

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

export type ElevationLevel = 0 | 1 | 2 | 3;

type Shadow = { y: number; blur: number; opacity: number; android: number };

const shadowSpec: Record<ColorScheme, { color: string; levels: Record<ElevationLevel, Shadow> }> = {
  dark: {
    color: '#000000',
    levels: {
      0: { y: 0, blur: 0, opacity: 0, android: 0 },
      1: { y: 1, blur: 3, opacity: 0.5, android: 1 },
      2: { y: 4, blur: 12, opacity: 0.55, android: 4 },
      3: { y: 12, blur: 28, opacity: 0.65, android: 12 },
    },
  },
  // Light: soft, warm-tinted shadows.
  light: {
    color: '#7A2E52',
    levels: {
      0: { y: 0, blur: 0, opacity: 0, android: 0 },
      1: { y: 1, blur: 3, opacity: 0.08, android: 1 },
      2: { y: 4, blur: 14, opacity: 0.12, android: 4 },
      3: { y: 12, blur: 32, opacity: 0.18, android: 12 },
    },
  },
};

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
}

function makeElevation(scheme: ColorScheme): Record<ElevationLevel, ViewStyle> {
  const { color, levels } = shadowSpec[scheme];
  const out = {} as Record<ElevationLevel, ViewStyle>;
  for (const key of [0, 1, 2, 3] as const) {
    const s = levels[key];
    if (Platform.OS === 'web') {
      const parts: string[] = [];
      if (s.blur > 0) parts.push(`0 ${s.y}px ${s.blur}px rgba(${hexToRgb(color)}, ${s.opacity})`);
      if (scheme === 'dark' && key > 0) parts.push('inset 0 1px 0 rgba(255, 255, 255, 0.06)');
      out[key] = parts.length ? { boxShadow: parts.join(', ') } : {};
    } else {
      out[key] = {
        shadowColor: color,
        shadowOffset: { width: 0, height: s.y },
        shadowOpacity: s.opacity,
        shadowRadius: s.blur,
        elevation: s.android,
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Motion. Warm, never urgent.
// ---------------------------------------------------------------------------

export const motion = {
  duration: { instant: 120, quick: 200, base: 320, gentle: 480, celebrate: 900 },
  /** Cubic-bezier control points. Feed to Easing.bezier(...) / CSS cubic-bezier(). */
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
  },
  spring: {
    gentle: { damping: 18, stiffness: 180, mass: 1 },
    /** Delight moments only (gifts, likes, celebrations). */
    bouncy: { damping: 12, stiffness: 200, mass: 1 },
  },
  /** The only looping animation allowed: the live dot's slow breathe. */
  liveBreathe: 1600,
} as const;

/** True when the OS asks for reduced motion. Reduced motion means fades only: no translate or scale. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type Theme = {
  scheme: ColorScheme;
  colors: Colors;
  brand: typeof brand;
  stage: Stage;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  elevation: Record<ElevationLevel, ViewStyle>;
  motion: typeof motion;
};

let cache: Partial<Record<ColorScheme, Theme>> = {};

function themeFor(scheme: ColorScheme): Theme {
  const hit = cache[scheme];
  if (hit) return hit;
  const t: Theme = {
    scheme,
    colors: palettes[scheme],
    brand,
    stage,
    spacing,
    radius,
    type,
    elevation: makeElevation(scheme),
    motion,
  };
  cache = { ...cache, [scheme]: t };
  return t;
}

/** Dark-first: anything but an explicit light scheme renders dark. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return themeFor(scheme === 'light' ? 'light' : 'dark');
}
