import { createContext, use, type Context } from 'react';

import {
  createTranslate,
  ENGLISH,
  type Translate,
  type UiLocale,
} from './messages.ts';

/** The language of the user interface of a deck. */
export interface UiLanguage {
  /** The BCP 47 tag of the language. */
  lang: string;
  t: Translate;
  /** The languages that the user interface can be shown in. */
  locales: readonly UiLocale[];
  /** Shows the user interface in another of the {@link locales}. */
  setLang: (lang: string) => void;
}

const DEFAULT: UiLanguage = {
  lang: ENGLISH.lang,
  t: createTranslate(ENGLISH),
  locales: [ENGLISH],
  setLang: () => undefined,
};

export const UiLanguageContext: Context<UiLanguage> =
  createContext<UiLanguage>(DEFAULT);

/** Returns the language of the user interface. English outside of a deck. */
export function useUiLanguage(): UiLanguage {
  return use(UiLanguageContext);
}

/** Returns the {@link Translate} function of the user interface. */
export function useT(): Translate {
  return use(UiLanguageContext).t;
}
