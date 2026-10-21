import { createHash } from 'node:crypto';

import type { Element } from 'hast';
import {
  bundledLanguages,
  bundledLanguagesInfo,
  bundledThemes,
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
  type LanguageRegistration,
  type ThemeRegistration,
} from 'shiki';

/** Theme of code blocks without a `theme` option. */
export const DEFAULT_THEME = 'github-dark';

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

let bundledScopes: Promise<ReadonlyMap<string, string>> | undefined;

/**
 * Returns the bundled languages of Shiki by the scopes of their grammars,
 * e.g., `typescript` for `source.ts`, which takes a moment to load the first
 * time.
 */
function getBundledScopes(): Promise<ReadonlyMap<string, string>> {
  bundledScopes ??= (async () => {
    const scopes = new Map<string, string>();
    for (const info of bundledLanguagesInfo) {
      for (const grammar of (await info.import()).default) {
        scopes.set(grammar.scopeName, grammar.name);
      }
    }
    return scopes;
  })();
  return bundledScopes;
}

/** Returns the scopes that `grammar` includes from other grammars. */
function includedScopes(
  grammar: unknown,
  found = new Set<string>(),
): Set<string> {
  if (Array.isArray(grammar)) {
    for (const item of grammar) {
      includedScopes(item, found);
    }
  } else if (typeof grammar === 'object' && grammar !== null) {
    for (const [key, value] of Object.entries(grammar)) {
      if (
        key === 'include' &&
        typeof value === 'string' &&
        !value.startsWith('#') &&
        !value.startsWith('$')
      ) {
        found.add(value.split('#')[0] ?? value);
      } else {
        includedScopes(value, found);
      }
    }
  }
  return found;
}

/**
 * Returns a highlighter with `languages` and `themes`, and the bundled
 * languages whose grammars the grammars of `languages` include, e.g.,
 * `typescript` for a template language that embeds `source.ts`.
 *
 * Shiki ignores grammars and themes loaded again with the same name, so a
 * highlighter is created for every set of them, e.g., when one of their
 * files changes, and only the last few are kept.
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
    highlighter = (async () => {
      const ownScopes = new Set(languages.map(({ scopeName }) => scopeName));
      const embedded = new Set<string>();
      if (languages.length > 0) {
        const scopes = await getBundledScopes();
        for (const scope of includedScopes(languages)) {
          const bundled = scopes.get(scope);
          if (!ownScopes.has(scope) && bundled !== undefined) {
            embedded.add(bundled);
          }
        }
      }
      return createHighlighter({
        // Bundled languages first, so that grammars of the same name replace
        // them.
        langs: [...(embedded as Set<BundledLanguage>), ...languages],
        themes: [...themes],
      });
    })();
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
