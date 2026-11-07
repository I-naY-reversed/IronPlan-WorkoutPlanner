import type { Palette } from '@/constants/theme';

export const OUTLINE = 1.5;

export function controlStyle(theme: Palette, selected = false) {
  return selected
    ? { backgroundColor: theme.text, borderColor: theme.text, borderWidth: OUTLINE }
    : { backgroundColor: 'transparent', borderColor: theme.steel, borderWidth: OUTLINE };
}

export function inputStyle(theme: Palette) {
  return { backgroundColor: 'transparent', borderColor: theme.steel, borderWidth: OUTLINE };
}

export function choiceStyle(theme: Palette, selected: boolean) {
  return selected
    ? { backgroundColor: theme.accentTint, borderColor: theme.choiceBorder, borderWidth: 2 }
    : { backgroundColor: 'transparent', borderColor: theme.steel, borderWidth: OUTLINE };
}
