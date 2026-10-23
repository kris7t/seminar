import { describe, expect, it } from 'vitest';

import { getContentUiLocale } from './uiLocales.ts';

describe('getContentUiLocale', () => {
  it('is the language of the deck', () => {
    expect(getContentUiLocale({ lang: 'de-AT' })).toEqual({
      lang: 'de',
      module: undefined,
    });
  });

  it('is a language of the deck mapped to a module', () => {
    expect(
      getContentUiLocale({
        lang: 'pt-BR',
        uiLanguages: ['de', { pt: './locales/pt.json' }],
      }),
    ).toEqual({ lang: 'pt-BR', module: './locales/pt.json' });
  });

  it('is English if the deck is in another language', () => {
    expect(getContentUiLocale({ lang: 'ja', uiLanguages: ['de'] })).toEqual({
      lang: 'en',
      module: undefined,
    });
    expect(getContentUiLocale({})).toEqual({ lang: 'en', module: undefined });
  });
});
