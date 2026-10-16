import { useCallback, useMemo, useState } from 'react';

import {
  createTranslate,
  ENGLISH,
  findLocale,
  type UiLocale,
} from './messages.ts';
import type { UiLanguage } from './UiLanguageContext.ts';

/** Key of the language of the user interface chosen by the viewer. */
const STORAGE_KEY = 'slider:ui-language';

function readChoice(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeChoice(lang: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The choice only lasts until the page is closed.
  }
}

/** Returns the locale among `locales` that the browser prefers, if any. */
function browserLocale(locales: readonly UiLocale[]): UiLocale | undefined {
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages;
  for (const lang of preferred) {
    const locale = findLocale(locales, lang);
    if (locale !== undefined) {
      return locale;
    }
  }
  return undefined;
}

/**
 * Chooses the language of the user interface among `locales`: the one the
 * viewer chose before, or if the deck offers several, the one their browser
 * prefers, or the one of the content of the deck, or the first one.
 */
function chooseLocale(
  locales: readonly UiLocale[],
  choice: string | undefined,
  contentLang: string | undefined,
): UiLocale {
  return (
    (choice === undefined ? undefined : findLocale(locales, choice)) ??
    (locales.length > 1 ? browserLocale(locales) : undefined) ??
    (contentLang === undefined
      ? undefined
      : findLocale(locales, contentLang)) ??
    locales[0] ??
    ENGLISH
  );
}

/**
 * Keeps the language of the user interface of a deck, which the viewer can
 * change among `uiLocales`, and which is remembered in the browser.
 *
 * @param contentLang The language of the content of the deck.
 * @param uiLocales The languages of the user interface that the deck offers.
 *   Defaults to English.
 */
export function useUiLanguageState(
  contentLang: string | undefined,
  uiLocales: readonly UiLocale[] | undefined,
): UiLanguage {
  const locales = useMemo(
    () =>
      uiLocales === undefined || uiLocales.length === 0 ? [ENGLISH] : uiLocales,
    [uiLocales],
  );
  const [choice, setChoice] = useState(readChoice);
  const locale = chooseLocale(locales, choice, contentLang);
  const setLang = useCallback((lang: string) => {
    setChoice(lang);
    storeChoice(lang);
  }, []);
  return useMemo(
    () => ({ lang: locale.lang, t: createTranslate(locale), locales, setLang }),
    [locale, locales, setLang],
  );
}
