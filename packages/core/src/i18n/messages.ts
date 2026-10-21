import en from './locales/en.json' with { type: 'json' };
import type EnglishCatalog from './locales/en.json';

/**
 * The messages of the user interface in a language, in the JSON format of
 * i18next: interpolated values are written as `{{name}}`, and plural forms
 * have keys with the plural category of `Intl.PluralRules` appended, e.g.,
 * `slides_one` and `slides_other`. Missing messages fall back to English.
 */
export type UiCatalog = Readonly<Partial<Record<string, string>>>;

/** The user interface in a language. */
export interface UiLocale {
  /** The BCP 47 tag of the language, e.g., `hu`. */
  readonly lang: string;
  readonly catalog: UiCatalog;
}

/** The keys of the messages of the user interface. */
export type MessageKey = keyof typeof EnglishCatalog;

/** Values interpolated into messages. */
export type MessageValues = Readonly<Record<string, string | number>>;

/**
 * Returns a message of the user interface. If `values` has a numeric `count`,
 * the plural form for it is used, if the catalog has one.
 */
export type Translate = (key: MessageKey, values?: MessageValues) => string;

/** The user interface in English, which other languages fall back to. */
export const ENGLISH: UiLocale = { lang: 'en', catalog: en };

const INTERPOLATION = /\{\{\s*(\w+)\s*\}\}/gu;

/** Returns the message for `key` in `locale`, falling back to English. */
function lookUp(
  locale: UiLocale,
  key: string,
  count: number | undefined,
): string | undefined {
  const candidates =
    count === undefined
      ? [key]
      : [
          `${key}_${new Intl.PluralRules(locale.lang).select(count)}`,
          `${key}_other`,
          key,
        ];
  for (const catalog of [locale.catalog, ENGLISH.catalog]) {
    for (const candidate of candidates) {
      const message = catalog[candidate];
      if (message !== undefined) {
        return message;
      }
    }
  }
  return undefined;
}

/** Creates the {@link Translate} function of `locale`. */
export function createTranslate(locale: UiLocale): Translate {
  return (key, values = {}) => {
    const { count } = values;
    const message =
      lookUp(locale, key, typeof count === 'number' ? count : undefined) ?? key;
    return message.replace(INTERPOLATION, (match, name: string) => {
      const value = values[name];
      return value === undefined ? match : String(value);
    });
  };
}

/** Returns the base language of the BCP 47 tag `lang`, e.g., `de` for `de-AT`. */
export function baseLanguage(lang: string): string {
  return lang.split('-')[0]?.toLowerCase() ?? lang;
}

/**
 * Returns the locale among `locales` for `lang`: one for the same tag, or for
 * the same base language.
 */
export function findLocale(
  locales: readonly UiLocale[],
  lang: string,
): UiLocale | undefined {
  const lower = lang.toLowerCase();
  return (
    locales.find((locale) => locale.lang.toLowerCase() === lower) ??
    locales.find((locale) => baseLanguage(locale.lang) === baseLanguage(lang))
  );
}

/** Returns the name of the language `lang` in that language, e.g., Magyar. */
export function languageName(lang: string): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang);
  } catch {
    name = undefined;
  }
  if (name === undefined) {
    return lang;
  }
  return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
}

const KEY_NAMES: Readonly<Record<string, MessageKey>> = {
  Left: 'keyLeft',
  Right: 'keyRight',
  Home: 'keyHome',
  End: 'keyEnd',
  PgUp: 'keyPageUp',
  PgDn: 'keyPageDown',
  Shift: 'keyShift',
};

/**
 * Returns a keyboard shortcut like `Shift+Home` with the names of the keys in
 * the language of `t`, e.g., `Umschalt+Pos1`.
 */
export function formatShortcut(t: Translate, shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => {
      const key = KEY_NAMES[part];
      return key === undefined ? part : t(key);
    })
    .join('+');
}
