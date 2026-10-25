import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { otherLang, readPageMessages } from './messages.ts';

const deckPath = fileURLToPath(
  new URL('../test/talk.deck.mdx', import.meta.url),
);

describe('readPageMessages', () => {
  it('is in the language of the deck', async () => {
    expect(await readPageMessages({ lang: 'de-AT' }, deckPath)).toEqual({
      skipToContent: { text: 'Zum Inhalt springen', lang: 'de' },
      aboutPage: { text: 'Über diese Seite', lang: 'de' },
      markdownSource: { text: 'Markdown-Quelltext', lang: 'de' },
    });
  });

  it('reads the module of the language of the deck', async () => {
    expect(
      await readPageMessages(
        { lang: 'pt', uiLanguages: [{ pt: './locales/pt.json' }] },
        deckPath,
      ),
    ).toEqual({
      skipToContent: { text: 'Pular para o conteúdo', lang: 'pt' },
      // Missing from the module.
      aboutPage: { text: 'About this page', lang: 'en' },
      markdownSource: { text: 'Markdown source', lang: 'en' },
    });
  });

  it('is in English otherwise', async () => {
    expect(await readPageMessages({ lang: 'ja' }, deckPath)).toEqual({
      skipToContent: { text: 'Skip to content', lang: 'en' },
      aboutPage: { text: 'About this page', lang: 'en' },
      markdownSource: { text: 'Markdown source', lang: 'en' },
    });
    expect(
      await readPageMessages(
        { lang: 'pt', uiLanguages: [{ pt: './locales/missing.json' }] },
        deckPath,
      ),
    ).toEqual({
      skipToContent: { text: 'Skip to content', lang: 'en' },
      aboutPage: { text: 'About this page', lang: 'en' },
      markdownSource: { text: 'Markdown source', lang: 'en' },
    });
  });
});

describe('otherLang', () => {
  it('is the language of a message in another language than the page', () => {
    expect(otherLang({ text: 'Skip to content', lang: 'en' }, 'ja')).toBe('en');
    expect(
      otherLang({ text: 'Zum Inhalt springen', lang: 'de' }, 'de-AT'),
    ).toBeUndefined();
  });
});
