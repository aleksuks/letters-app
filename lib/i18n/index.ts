import { useLanguage, Lang } from "@/contexts/language";

/**
 * Pins `en` to exactly the same key set as `lt` (via excess/missing property
 * checking on the object literals passed in) so a screen can't ship with a
 * translation silently missing a key. Call it where a strings module is
 * defined, not where it's consumed.
 */
export function defineStrings<T extends Record<string, string>>(dict: {
  lt: T;
  en: T;
}): { lt: T; en: T } {
  return dict;
}

/** Picks the dictionary for the active language. Call at the top of a screen. */
export function useStrings<T extends Record<string, string>>(dict: {
  lt: T;
  en: T;
}): T {
  const { lang } = useLanguage();
  return dict[lang];
}

/** Fills `{name}`-style placeholders in a translated string. */
export function format(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
    template
  );
}

// Lithuanian has three plural forms (1 diena, 2–9 dienos, 10+/11–19 dienų —
// the "few" form also covers any count ending 2-9 except the 11-19 teens).
// English only has two. Screens that show a bare count next to a noun call
// this instead of hand-rolling the split each time.
export function pluralLt(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return few;
  return many;
}

export function pluralEn(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

export function plural(lang: Lang, n: number, forms: { lt: [string, string, string]; en: [string, string] }): string {
  return lang === "lt"
    ? pluralLt(n, ...forms.lt)
    : pluralEn(n, ...forms.en);
}
