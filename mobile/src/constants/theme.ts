import '@/global.css';

import { Platform } from 'react-native';

export const Brand = {
  barSteel: '#1F2326',
  steel2: '#2B3034',
  steel3: '#363C41',
  chalk: '#F6F7F5',
  chalk2: '#E9ECEA',
  chalk3: '#DCE0DD',
  slate: '#5E676D',
  intervalChalk: '#B9C0C4',
  intervalSteel: '#4A5257',
  plateYellow: '#F0C419',
} as const;

export const Plates = {
  red: '#C8312F',
  blue: '#2459A8',
  yellow: Brand.plateYellow,
  green: '#2E8B4E',
  white: '#FFFFFF',
} as const;

const chalk = {
  text: Brand.barSteel,
  textSecondary: Brand.slate,
  steel: Brand.slate,
  background: Brand.chalk,
  backgroundElement: Brand.chalk2,
  backgroundSelected: Brand.chalk3,
  accent: Brand.plateYellow,
  accentText: Brand.barSteel,
  link: Brand.barSteel,
  danger: Brand.barSteel,
  interval: Brand.intervalChalk,
  bracket: '#946800',
  bracketBand: '#7A848A',
  done: Plates.green,
  doneTint: 'rgba(46, 139, 78, 0.14)',
  accentTint: 'rgba(240, 196, 25, 0.18)',
} as const;

const steel = {
  text: Brand.chalk,
  textSecondary: '#B9C0C4',
  steel: '#9AA3A9',
  background: Brand.barSteel,
  backgroundElement: Brand.steel2,
  backgroundSelected: Brand.steel3,
  accent: Brand.plateYellow,
  accentText: Brand.barSteel,
  link: Brand.plateYellow,
  danger: Brand.chalk,
  interval: Brand.intervalSteel,
  bracket: Brand.plateYellow,
  bracketBand: '#8C959B',
  done: '#5DBB7C',
  doneTint: 'rgba(46, 139, 78, 0.24)',
  accentTint: 'rgba(240, 196, 25, 0.14)',
} as const;

export type Surface = 'chalk' | 'steel';
export const Colors = { chalk, steel } as const;
export type Palette = { [K in keyof typeof chalk]: string };
export type ThemeColor = keyof Palette;

export const CYRILLIC_FONTS: Record<string, string> = {
  Archivo_400Regular: 'SofiaSans_400Regular',
  Archivo_500Medium: 'SofiaSans_500Medium',
  Archivo_600SemiBold: 'SofiaSans_600SemiBold',
  Archivo_700Bold: 'SofiaSans_700Bold',
  'ArchivoCompressed-Bold': 'SofiaSansExtraCondensed_700Bold',
};

export const Fonts = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  compressed: 'ArchivoCompressed-Bold',
} as const;

export const TypeScale = { xs: 14, sm: 15, md: 17, lg: 22, xl: 28, hero: 72 } as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { input: 2, button: 6, sheet: 14 } as const;

export const BottomTabInset = Platform.select({ ios: 50, default: 0 }) ?? 0;
export const MaxContentWidth = 800;
