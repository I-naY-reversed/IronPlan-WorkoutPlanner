import { Platform } from 'react-native';

import type { ColorTheme } from '@/domain/profile';

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
  bracketInverse: Brand.plateYellow,
  choiceBorder: '#946800',
  highlight: '#946800',
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
  bracketInverse: Brand.plateYellow,
  choiceBorder: Brand.plateYellow,
  highlight: Brand.plateYellow,
  bracketBand: '#8C959B',
  done: '#5DBB7C',
  doneTint: 'rgba(46, 139, 78, 0.24)',
  accentTint: 'rgba(240, 196, 25, 0.14)',
} as const;

export type Palette = { [K in keyof typeof chalk]: string };

const plateLight = {
  text: '#1A150E',
  textSecondary: '#625D54',
  steel: '#67635C',
  background: '#F9F4EE',
  backgroundElement: '#ECE7DE',
  backgroundSelected: '#E0DAD0',
  accent: '#C52C2A',
  accentText: '#FFFFFF',
  link: '#1A150E',
  danger: '#1A150E',
  interval: '#D5D0C8',
  bracket: '#2F59AB',
  bracketInverse: '#8EB1F1',
  choiceBorder: '#C52C2A',
  highlight: '#C52C2A',
  bracketBand: '#7687A5',
  done: '#27713D',
  doneTint: 'rgba(39, 113, 61, 0.14)',
  accentTint: 'rgba(197, 44, 42, 0.12)',
} satisfies Palette;

const plateDark = {
  text: '#F9F4EE',
  textSecondary: '#BABEC3',
  steel: '#A0A5AB',
  background: '#16191C',
  backgroundElement: '#212428',
  backgroundSelected: '#2D3135',
  accent: '#EF675C',
  accentText: '#16191C',
  link: '#F9F4EE',
  danger: '#F9F4EE',
  interval: '#44484D',
  bracket: '#8EB1F1',
  bracketInverse: '#2F59AB',
  choiceBorder: '#EF675C',
  highlight: '#EF675C',
  bracketBand: '#7687A5',
  done: '#6FC884',
  doneTint: 'rgba(111, 200, 132, 0.18)',
  accentTint: 'rgba(239, 103, 92, 0.16)',
} satisfies Palette;

export type Surface = 'chalk' | 'steel';
export const Colors: Record<ColorTheme, Record<Surface, Palette>> = {
  plate: { chalk: plateLight, steel: plateDark },
  classic: { chalk, steel },
};
export type ThemeColor = keyof Palette;

export const Fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  compressed: 'IBMPlexSansCondensed_700Bold',
  serif: 'PTSerif_700Bold',
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
