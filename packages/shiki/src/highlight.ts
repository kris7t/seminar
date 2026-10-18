import type { CodeHighlighter } from '@slider/mdx';
import {
  bundledLanguages,
  bundledThemes,
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
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

let highlighter: Promise<Highlighter> | undefined;

function isLanguage(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang);
}

function isTheme(theme: string): theme is BundledTheme {
  return Object.hasOwn(bundledThemes, theme);
}

/**
 * Highlights code blocks with Shiki when compiling decks, see `CodeConfig`
 * in `@slider/core`. Takes the `theme` option, the name of a theme of VS
 * Code bundled with Shiki, e.g., `github-dark`.
 *
 * Loads only the grammars and themes that decks use. Code blocks in unknown
 * languages are reported, and shown without highlighting.
 */
export const highlight: CodeHighlighter = async ({ code, lang }, options) => {
  const theme = options['theme'] ?? DEFAULT_THEME;
  if (typeof theme !== 'string' || !isTheme(theme)) {
    throw new Error(
      `Unknown theme ${JSON.stringify(theme)}, expected the name of a theme of Shiki`,
    );
  }
  let language: BundledLanguage | undefined;
  if (lang !== undefined && !PLAIN_LANGUAGES.has(lang)) {
    if (!isLanguage(lang)) {
      throw new Error(`Unknown language ${lang}`);
    }
    language = lang;
  }
  highlighter ??= createHighlighter({ themes: [], langs: [] });
  const loaded = await highlighter;
  if (!loaded.getLoadedThemes().includes(theme)) {
    await loaded.loadTheme(theme);
  }
  if (
    language !== undefined &&
    !loaded.getLoadedLanguages().includes(language)
  ) {
    await loaded.loadLanguage(language);
  }
  const root = loaded.codeToHast(code, { lang: language ?? 'text', theme });
  const [pre] = root.children;
  return pre?.type === 'element' ? pre : undefined;
};
