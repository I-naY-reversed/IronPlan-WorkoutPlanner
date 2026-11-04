import { Children, useContext } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { CYRILLIC_FONTS, Fonts, ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LanguageContext, translate } from '@/i18n';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'small'
    | 'smallBold'
    | 'caption'
    | 'heading'
    | 'subtitle'
    | 'label'
    | 'num'
    | 'numSmall'
    | 'numLarge'
    | 'numHero';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, children, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const lang = useContext(LanguageContext);
  return (
    <Text style={lang === 'ru' ? cyrillic([{ color: theme[themeColor ?? 'text'] }, styles[type], style]) : [{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest}>
      {lang === 'en' ? children : localize(children, lang)}
    </Text>
  );
}

function cyrillic(style: TextProps['style']) {
  const flat = StyleSheet.flatten(style) ?? {};
  return flat.fontFamily && CYRILLIC_FONTS[flat.fontFamily] ? { ...flat, fontFamily: CYRILLIC_FONTS[flat.fontFamily] } : flat;
}

function localize(children: React.ReactNode, lang: Parameters<typeof translate>[1]): React.ReactNode {
  const parts = Children.toArray(children);
  if (parts.every((c) => typeof c === 'string' || typeof c === 'number')) return translate(parts.join(''), lang);
  return parts.map((c) => (typeof c === 'string' ? translate(c, lang) : c));
}

const tnum = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  default: { fontFamily: Fonts.regular, fontSize: TypeScale.md, lineHeight: 24 },
  small: { fontFamily: Fonts.regular, fontSize: TypeScale.sm, lineHeight: 21 },
  smallBold: { fontFamily: Fonts.semibold, fontSize: TypeScale.sm, lineHeight: 21 },
  caption: { fontFamily: Fonts.regular, fontSize: TypeScale.xs, lineHeight: 18 },
  heading: { fontFamily: Fonts.semibold, fontSize: TypeScale.lg, lineHeight: 28 },
  subtitle: { fontFamily: Fonts.semibold, fontSize: TypeScale.xl, lineHeight: 34 },
  label: { fontFamily: Fonts.medium, fontSize: TypeScale.sm, lineHeight: 20 },
  num: { fontFamily: Fonts.medium, fontSize: TypeScale.md, lineHeight: 24, ...tnum },
  numSmall: { fontFamily: Fonts.regular, fontSize: TypeScale.sm, lineHeight: 21, ...tnum },
  numLarge: { fontFamily: Fonts.semibold, fontSize: TypeScale.xl, lineHeight: 34, ...tnum },
  numHero: { fontFamily: Fonts.compressed, fontSize: TypeScale.hero, lineHeight: 80, ...tnum },
});
