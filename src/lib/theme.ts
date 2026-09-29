import { useColorScheme } from 'react-native';

export type ColorScheme = 'dark' | 'light';

export type Colors = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  /** Outline maroon from the logo: focus rings and badges. */
  outline: string;
  danger: string;
  overlay: string;
};

/** Rainbow from the logo mane. Tiny moments only (wordmark, like burst, avatar tints). */
export const rainbow = ['#FFD93B', '#FF8A1F', '#FF3D9A', '#B45CFF', '#28C2F2', '#5BD245'] as const;

const dark: Colors = {
  bg: '#0B0A0D',
  surface: '#16141A',
  surface2: '#201D26',
  border: '#2C2833',
  text: '#F7F3F8',
  muted: '#A59DAE',
  primary: '#FF6FB5',
  primaryPressed: '#E4559C',
  onPrimary: '#1A0710',
  outline: '#8C1240',
  danger: '#FF5C5C',
  overlay: 'rgba(11,10,13,0.72)',
};

const light: Colors = {
  bg: '#FFF8FB',
  surface: '#FFFFFF',
  surface2: '#FBEFF5',
  border: '#EFE4EC',
  text: '#1A1320',
  muted: '#6E6477',
  primary: '#FF6FB5',
  primaryPressed: '#E4559C',
  onPrimary: '#1A0710',
  outline: '#8C1240',
  danger: '#C62828',
  overlay: 'rgba(26,19,32,0.6)',
};

export const palettes: Record<ColorScheme, Colors> = { dark, light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontSize: 17, lineHeight: 24 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  headline: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
};

const themes: Record<ColorScheme, Theme> = {
  dark: { scheme: 'dark', colors: dark, spacing, radius, type },
  light: { scheme: 'light', colors: light, spacing, radius, type },
};

/** Dark-first: anything but an explicit light scheme renders dark. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return themes[scheme === 'light' ? 'light' : 'dark'];
}

/** Stable avatar tint from a username, drawn from the rainbow set. */
export function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return rainbow[h % rainbow.length];
}
