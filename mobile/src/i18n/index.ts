import { createContext, useContext } from 'react';

import fr from './fr.json';
import ru from './ru.json';

export type Language = 'en' | 'fr' | 'ru';
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ru', label: 'Русский' },
];

type Catalog = { exact: Record<string, string>; patterns: [RegExp, string][] };

function compile(entries: Record<string, string>): Catalog {
  const exact: Record<string, string> = {};
  const patterns: [RegExp, string][] = [];
  for (const [en, out] of Object.entries(entries)) {
    if (!/\{\d+\}/.test(en)) {
      exact[en] = out;
      continue;
    }
    const source = en
      .split(/(\{\d+\})/)
      .map((part) => (/^\{\d+\}$/.test(part) ? '([\\s\\S]+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('');
    patterns.push([new RegExp(`^${source}$`), out]);
  }
  patterns.sort((a, b) => b[0].source.replace(/\(\[\\s\\S\]\+\?\)/g, '').length - a[0].source.replace(/\(\[\\s\\S\]\+\?\)/g, '').length);
  return { exact, patterns };
}

const CATALOGS: Record<Exclude<Language, 'en'>, Catalog> = { fr: compile(fr), ru: compile(ru) };
const cache: Record<string, Map<string, string>> = { fr: new Map(), ru: new Map() };
const KEEP = new Set(LANGUAGES.map((l) => l.label));

const LATIN_LEFT = /[A-Za-z]{2,}/;
const KEEP_LATIN = /\b(RPE|RIR|e1RM|1RM|IPF|OpenIPF|CSV|Strong|Hevy|Ironplan|Streetlifting|Muay|Thai)\b/g;

export function translate(text: string, lang: Language, depth = 0): string {
  if (lang === 'en' || !/[A-Za-z]/.test(text) || KEEP.has(text)) return text;
  const hit = cache[lang].get(text);
  if (hit !== undefined) return hit;
  const lead = text.match(/^\s*/)![0];
  const trail = text.match(/\s*$/)![0];
  const core = text.trim();
  const cat = CATALOGS[lang];
  let out = cat.exact[core];
  const sentences = core.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const items = core.split(', ');
  if (out === undefined && items.length > 1 && items.every((i) => i in cat.exact)) out = items.map((i) => cat.exact[i]).join(', ');
  if (out === undefined && sentences.length > 1) out = sentences.map((s) => translate(s, lang, depth)).join(' ');
  if (out === undefined && depth < 2) {
    for (const [re, tpl] of cat.patterns) {
      const m = core.match(re);
      if (!m) continue;
      out = tpl.replace(/\{(\d+)\}/g, (_, i) => translate(m[Number(i) + 1] ?? '', lang, depth + 1));
      break;
    }
  }
  const result = out === undefined ? text : lead + out + trail;
  if (__DEV__ && lang === 'ru' && LATIN_LEFT.test(result.replace(KEEP_LATIN, ''))) ((globalThis as { __i18nMisses?: Set<string> }).__i18nMisses ??= new Set()).add(core);
  cache[lang].set(text, result);
  return result;
}

export function deviceLanguage(): Language {
  const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
  return code === 'fr' || code === 'ru' ? code : 'en';
}

export const LanguageContext = createContext<Language>('en');

let active: Language = 'en';
export function setActiveLanguage(lang: Language) {
  active = lang;
}
export const t = (text: string) => translate(text, active);
export const dateLocale = () => ({ en: 'en-GB', fr: 'fr-FR', ru: 'ru-RU' })[active];

export function useT() {
  const lang = useContext(LanguageContext);
  return (text: string) => translate(text, lang);
}
