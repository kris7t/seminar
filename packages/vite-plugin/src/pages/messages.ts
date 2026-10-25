import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import de from '@seminar/core/locales/de.json' with { type: 'json' };
import en from '@seminar/core/locales/en.json' with { type: 'json' };
import fr from '@seminar/core/locales/fr.json' with { type: 'json' };
import hu from '@seminar/core/locales/hu.json' with { type: 'json' };
import { getContentUiLocale } from '@seminar/mdx';

type Catalog = Readonly<Partial<Record<string, unknown>>>;

/** The messages of the languages of the user interface of the core. */
const CORE_CATALOGS: ReadonlyMap<string, Catalog> = new Map([
  ['en', en],
  ['hu', hu],
  ['de', de],
  ['fr', fr],
]);

/** A message of the page of a deck. */
export interface PageMessage {
  text: string;
  /** The BCP 47 tag of the language of the message. */
  lang: string;
}

/** The messages of the page of a deck around the deck. */
export interface PageMessages {
  /** The label of the link that skips to the content of the deck. */
  skipToContent: PageMessage;
  /** The label of the colophon, see `writeColophon`. */
  aboutPage: PageMessage;
  /** The label of the Markdown of the deck before the document of the deck. */
  markdownSource: PageMessage;
}

/** Returns the base language of the BCP 47 tag `lang`, e.g., `de` for `de-AT`. */
function baseLanguage(lang: string): string {
  return lang.split('-')[0]?.toLowerCase() ?? lang;
}

/**
 * Returns the language of `message` if it's another one than `lang`, the
 * language of the page, so that it can be marked.
 */
export function otherLang(
  message: PageMessage,
  lang: string,
): string | undefined {
  return baseLanguage(message.lang) === baseLanguage(lang)
    ? undefined
    : message.lang;
}

/**
 * Reads the messages of the module `module` of a language of the user
 * interface of the deck at `deckPath`, which imports it.
 */
async function readCatalog(module: string, deckPath: string): Promise<Catalog> {
  const file =
    module.startsWith('.') || path.isAbsolute(module)
      ? path.resolve(path.dirname(deckPath), module)
      : createRequire(deckPath).resolve(module);
  return JSON.parse(await readFile(file, 'utf8')) as Catalog;
}

/**
 * Returns the messages of the page of the deck at `deckPath` with
 * `frontmatter` in the language of the user interface that goes with the
 * content of the deck (see `getContentUiLocale`), falling back to English
 * for those it doesn't have. Errors in the modules of languages are reported
 * when the deck is compiled.
 */
export async function readPageMessages(
  frontmatter: Record<string, unknown>,
  deckPath: string,
): Promise<PageMessages> {
  const { lang, module } = getContentUiLocale(frontmatter);
  let catalog: Catalog | undefined;
  try {
    catalog =
      module === undefined
        ? CORE_CATALOGS.get(lang)
        : await readCatalog(module, deckPath);
  } catch {
    catalog = undefined;
  }
  const message = (key: keyof PageMessages): PageMessage => {
    const text = catalog?.[key];
    return typeof text === 'string' && text !== ''
      ? { text, lang }
      : { text: en[key], lang: 'en' };
  };
  return {
    skipToContent: message('skipToContent'),
    aboutPage: message('aboutPage'),
    markdownSource: message('markdownSource'),
  };
}
