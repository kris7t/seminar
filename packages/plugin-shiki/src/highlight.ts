import { createHash } from 'node:crypto';

import type { Element } from 'hast';
import {
  bundledLanguages,
  bundledThemes,
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
  type LanguageRegistration,
  type ThemeRegistration,
} from 'shiki';

/** Theme of code blocks without a `theme` option. */
export const DEFAULT_THEME = 'github-light';

/** Languages that need no grammar. */
const PLAIN_LANGUAGES: ReadonlySet<string> = new Set([
  'text',
  'txt',
  'plain',
  'plaintext',
]);

/** How many highlighters with different grammars and themes to keep. */
const MAX_HIGHLIGHTERS = 4;

/** Highlighters by the grammars and themes they were created with. */
const highlighters = new Map<string, Promise<Highlighter>>();

function isBundledLanguage(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang);
}

function isBundledTheme(theme: string): theme is BundledTheme {
  return Object.hasOwn(bundledThemes, theme);
}

/**
 * Returns a highlighter with `languages` and `themes`. Shiki ignores grammars
 * and themes loaded again with the same name, so a highlighter is created
 * for every set of them, e.g., when one of their files changes, and only the
 * last few are kept.
 */
function getHighlighter(
  languages: readonly LanguageRegistration[],
  themes: readonly ThemeRegistration[],
): Promise<Highlighter> {
  const key = createHash('sha256')
    .update(JSON.stringify([languages, themes]))
    .digest('hex');
  let highlighter = highlighters.get(key);
  if (highlighter === undefined) {
    highlighter = createHighlighter({
      langs: [...languages],
      themes: [...themes],
    });
  } else {
    highlighters.delete(key);
  }
  // The most recently used one is last.
  highlighters.set(key, highlighter);
  for (const [oldKey, old] of highlighters) {
    if (highlighters.size <= MAX_HIGHLIGHTERS) {
      break;
    }
    highlighters.delete(oldKey);
    void old.then((disposed) => {
      disposed.dispose();
    });
  }
  return highlighter;
}

/** A code block to highlight. */
export interface CodeBlock {
  /** The text of the block. */
  code: string;
  /** The language of the block, e.g., `ts`, or none for plain text. */
  lang: string | undefined;
}

/** How to highlight code blocks. */
export interface HighlightOptions {
  /**
   * The name of the theme, either a theme of VS Code bundled with Shiki,
   * e.g., `github-dark`, or one of `themes`. Defaults to
   * {@link DEFAULT_THEME}.
   */
  theme?: string | undefined;
  /** Grammars of languages besides those bundled with Shiki. */
  languages?: readonly LanguageRegistration[] | undefined;
  /** Themes besides those bundled with Shiki. */
  themes?: readonly ThemeRegistration[] | undefined;
}

/**
 * Highlights a code block with Shiki, in a `pre` element. Loads only the
 * bundled grammars and themes that decks use.
 *
 * @throws For unknown languages and themes.
 */
export async function highlight(
  { code, lang }: CodeBlock,
  { theme = DEFAULT_THEME, languages = [], themes = [] }: HighlightOptions = {},
): Promise<Element | undefined> {
  const customTheme = themes.some(({ name }) => name === theme);
  if (!customTheme && !isBundledTheme(theme)) {
    throw new Error(
      `Unknown theme ${JSON.stringify(theme)}, expected the name of a theme of Shiki, or of one in \`themes\``,
    );
  }
  let language: string | undefined;
  if (lang !== undefined && !PLAIN_LANGUAGES.has(lang)) {
    const custom = languages.some(
      ({ name, aliases }) => name === lang || aliases?.includes(lang) === true,
    );
    if (!custom && !isBundledLanguage(lang)) {
      throw new Error(`Unknown language ${lang}`);
    }
    language = lang;
  }
  const loaded = await getHighlighter(languages, themes);
  if (!loaded.getLoadedThemes().includes(theme) && isBundledTheme(theme)) {
    await loaded.loadTheme(theme);
  }
  if (
    language !== undefined &&
    !loaded.getLoadedLanguages().includes(language) &&
    isBundledLanguage(language)
  ) {
    await loaded.loadLanguage(language);
  }
  const root = loaded.codeToHast(code, {
    lang: language ?? 'text',
    theme,
    // Focusable elements count as interactive, so clicking the code wouldn't
    // go to the next step.
    tabindex: false,
  });
  const [pre] = root.children;
  return pre?.type === 'element' ? pre : undefined;
}
