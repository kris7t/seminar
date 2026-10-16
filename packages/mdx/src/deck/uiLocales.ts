import type { VFile } from 'vfile';

/**
 * The languages that `@slider/core` has a user interface in, and the names of
 * their exports.
 */
export const CORE_UI_LOCALES: ReadonlyMap<string, string> = new Map([
  ['en', 'ENGLISH'],
  ['hu', 'HUNGARIAN'],
  ['de', 'GERMAN'],
  ['fr', 'FRENCH'],
]);

/** A language of the user interface of a deck, and where to import it from. */
export interface UiLocaleSource {
  /** The BCP 47 tag of the language. */
  lang: string;
  /**
   * The module with the messages of the language, or `undefined` for a
   * language of the core.
   */
  module: string | undefined;
}

/** Returns the base language of the BCP 47 tag `lang`, e.g., `de` for `de-AT`. */
function baseLanguage(lang: string): string {
  return lang.split('-')[0]?.toLowerCase() ?? lang;
}

/**
 * Returns the language of a deck, from the `lang` of its frontmatter. Defaults
 * to English.
 */
export function getDeckLang(
  frontmatter: Record<string, unknown>,
  file: VFile,
): string {
  const { lang } = frontmatter;
  if (lang === undefined) {
    return 'en';
  }
  if (typeof lang !== 'string' || lang === '') {
    file.message(
      'Expected `lang` in the frontmatter to be a language tag, like `en`',
    );
    return 'en';
  }
  return lang;
}

/** Returns the language of the core for `lang`, if the core has it. */
function coreLocale(lang: string): UiLocaleSource | undefined {
  const base = baseLanguage(lang);
  return CORE_UI_LOCALES.has(base)
    ? { lang: base, module: undefined }
    : undefined;
}

/**
 * Returns the languages that the user interface of a deck can be shown in:
 * the language of the deck, and those listed in the `uiLanguages` of its
 * frontmatter, which defaults to English, either as languages of the core, like `de`, or as mappings
 * from a language to a module with its messages in the JSON format of
 * i18next, like `{ pt: ./locales/pt.json }`.
 */
export function getUiLocaleSources(
  frontmatter: Record<string, unknown>,
  deckLang: string,
  file: VFile,
): UiLocaleSource[] {
  const sources: UiLocaleSource[] = [];
  const add = (source: UiLocaleSource) => {
    if (
      !sources.some(
        ({ lang }) => baseLanguage(lang) === baseLanguage(source.lang),
      )
    ) {
      sources.push(source);
    }
  };
  // The language of the deck and English by default, e.g., for students from
  // abroad, which their browsers may prefer.
  const { uiLanguages = ['en'] } = frontmatter;
  const entries: unknown[] = Array.isArray(uiLanguages)
    ? uiLanguages
    : [uiLanguages];
  // Entries for the language of the deck take precedence over the core.
  const custom = new Map<string, string>();
  for (const entry of entries) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      for (const [lang, module] of Object.entries(entry)) {
        if (typeof module === 'string' && module !== '') {
          custom.set(lang, module);
        } else {
          file.message(
            `Expected the module of the user interface in \`${lang}\` in \`uiLanguages\` to be a module, like \`./locales/${lang}.json\``,
          );
        }
      }
    }
  }
  const resolve = (lang: string): UiLocaleSource | undefined => {
    const module =
      custom.get(lang) ??
      [...custom].find(
        ([other]) => baseLanguage(other) === baseLanguage(lang),
      )?.[1];
    return module === undefined ? coreLocale(lang) : { lang, module };
  };
  const own = resolve(deckLang);
  if (own === undefined) {
    file.message(
      `The user interface isn't available in \`${deckLang}\`, the language of the deck, so it's shown in English. Map \`${deckLang}\` to a module with its messages in \`uiLanguages\` to add it.`,
    );
  } else {
    add(own);
  }
  for (const entry of entries) {
    if (typeof entry === 'string') {
      const source = coreLocale(entry);
      if (source === undefined) {
        file.message(
          `The user interface isn't available in \`${entry}\`. Map \`${entry}\` to a module with its messages in \`uiLanguages\` to add it.`,
        );
      } else {
        add(source);
      }
    } else if (typeof entry === 'object' && entry !== null) {
      for (const lang of Object.keys(entry)) {
        const source = resolve(lang);
        if (source !== undefined) {
          add(source);
        }
      }
    } else {
      file.message(
        'Expected `uiLanguages` in the frontmatter to list languages, like `de`, or map them to modules, like `{ pt: ./locales/pt.json }`',
      );
    }
  }
  return sources;
}
