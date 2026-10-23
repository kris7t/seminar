import { createServer, type ResolvedConfig, type ViteDevServer } from 'vite';

import { imageMarkers } from '../inline/images.ts';

/** Query that marks the module that renders a deck as a document. */
export const DOCUMENT_QUERY = '?seminar-document';

/** Prefix of the virtual modules that render decks as documents. */
export const DOCUMENT_PREFIX = '\0seminar-document:';

/** How long rendering a document may wait for suspended components. */
const RENDER_TIMEOUT = 10_000;

/**
 * Generates the module that renders the deck at `deckPath` as a document on
 * the server (see `DeckDocument`).
 */
export function renderDocumentModule(deckPath: string): string {
  return `import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { DeckDocument } from '@seminar/core';
import { createElement } from 'react';
import { prerender } from 'react-dom/static';
import Deck from ${JSON.stringify(deckPath)};

export async function render() {
  const cache = createCache({ key: 'css' });
  // Keeps the styles in the cache instead of rendering them, since the
  // document doesn't need them.
  cache.compat = true;
  const errors = [];
  const { prelude } = await prerender(
    createElement(
      CacheProvider,
      { value: cache },
      createElement(DeckDocument, null, createElement(Deck)),
    ),
    {
      signal: AbortSignal.timeout(${String(RENDER_TIMEOUT)}),
      onError: (error) => {
        errors.push(error);
      },
    },
  );
  if (errors.length > 0) {
    throw errors[0];
  }
  return new Response(prelude).text();
}
`;
}

/**
 * Removes what documents rendered by React don't need: the markers that React
 * leaves between text and around suspended components for hydration, since
 * documents are never hydrated, the links that preload images, which would
 * put their data URIs before the text, and styles and classes. Emotion only
 * leaves out its styles if it uses the cache of the document, which a second
 * copy of Emotion doesn't.
 *
 * React escapes quotes in text and attribute values, so they can't contain
 * these.
 */
export function cleanDocument(html: string): string {
  return html
    .replaceAll(/<!--(?: |\/?\$[!?]?)-->/g, '')
    .replaceAll(/<link rel="preload"[^>]*>/g, '')
    .replaceAll(/<style data-emotion="[^"]*"[^>]*>[^<]*<\/style>/g, '')
    .replaceAll(/ class="[^"]*"/g, '');
}

/** Elements that start a line of their own in documents. */
const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);

/** Elements whose text keeps its line breaks. */
const PREFORMATTED_ELEMENTS = new Set(['pre', 'textarea']);

/**
 * Starts each block of `html`, like headings and paragraphs, on a line of its
 * own, outside of preformatted text, so that tools that read files by lines
 * can read the document, which React renders on a single line. Line breaks
 * between blocks don't change how the document looks.
 */
export function breakLines(html: string): string {
  let preformatted = 0;
  return html.replaceAll(
    /<(\/?)([a-zA-Z][\w-]*)/g,
    (tag, close: string, name: string, offset: number) => {
      const element = name.toLowerCase();
      if (PREFORMATTED_ELEMENTS.has(element)) {
        preformatted = Math.max(0, preformatted + (close === '' ? 1 : -1));
        if (close !== '') {
          return tag;
        }
      }
      const opens = close === '' && BLOCK_ELEMENTS.has(element);
      const inside =
        preformatted > (PREFORMATTED_ELEMENTS.has(element) ? 1 : 0);
      return opens && !inside && offset > 0 && html[offset - 1] !== '\n'
        ? `\n${tag}`
        : tag;
    },
  );
}

/** Elements whose text can't be broken into lines without changing it. */
const VERBATIM_ELEMENTS = new Set([
  'annotation',
  'pre',
  'script',
  'style',
  'textarea',
  'title',
]);

/** Matches a tag, whose quoted attribute values may have `>` in them. */
const TAG_PATTERN = /<(\/?)([a-zA-Z][\w-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/y;

/**
 * Breaks the lines of `html` that are longer than `width` at their last space
 * before it, so that tools that read files by lines get lines that fit, e.g.,
 * paragraphs with formulas. Only breaks at spaces in text and between
 * attributes, where a line break means the same, but not in attribute values
 * or in elements whose text has to stay as it is, like `pre`. A space and a
 * line break have the same size, so the size of `html` stays the same.
 */
export function wrapLines(html: string, width = 100): string {
  const characters = html.split('');
  let verbatim = 0;
  let lineStart = 0;
  let lastBreak = -1;
  let tagEnd = -1;
  let tag: { close: boolean; name: string } | undefined;
  let quote: string | undefined;
  for (let i = 0; i < html.length; i += 1) {
    const character = html[i];
    if (i === tagEnd) {
      if (tag !== undefined && VERBATIM_ELEMENTS.has(tag.name)) {
        verbatim = Math.max(0, verbatim + (tag.close ? -1 : 1));
      }
      tag = undefined;
    }
    if (tag === undefined && character === '<') {
      TAG_PATTERN.lastIndex = i;
      const match = TAG_PATTERN.exec(html);
      if (match !== null) {
        tag = { close: match[1] === '/', name: (match[2] ?? '').toLowerCase() };
        tagEnd = i + match[0].length;
      }
    } else if (tag !== undefined && (character === '"' || character === "'")) {
      quote =
        quote === undefined
          ? character
          : quote === character
            ? undefined
            : quote;
    }
    if (character === '\n') {
      lineStart = i + 1;
      lastBreak = -1;
    } else if (character === ' ' && verbatim === 0 && quote === undefined) {
      lastBreak = i;
    }
    if (i - lineStart >= width && lastBreak >= lineStart) {
      characters[lastBreak] = '\n';
      lineStart = lastBreak + 1;
      lastBreak = -1;
    }
  }
  return characters.join('');
}

/** Renders the deck at `deckPath` as the HTML of a document. */
export type RenderDocument = (deckPath: string) => Promise<string>;

interface DocumentModule {
  render: () => Promise<string>;
}

/** Renders decks with the modules that `server` loads for the server. */
export function documentRenderer(server: ViteDevServer): RenderDocument {
  return async (deckPath) => {
    const module = (await server.ssrLoadModule(
      deckPath + DOCUMENT_QUERY,
    )) as Partial<DocumentModule>;
    if (typeof module.render !== 'function') {
      throw new Error(`${deckPath}${DOCUMENT_QUERY} doesn't export render`);
    }
    return wrapLines(breakLines(cleanDocument(await module.render())));
  };
}

/**
 * Creates a server that loads the modules of `config` for the server, to
 * render documents while building, without listening or watching files.
 * Images in the documents are markers, which the build resolves (see
 * `resolveImages`).
 */
export function createDocumentServer(
  config: ResolvedConfig,
): Promise<ViteDevServer> {
  return createServer({
    ...config.inlineConfig,
    plugins: [...(config.inlineConfig.plugins ?? []), imageMarkers()],
    configFile: config.configFile ?? false,
    root: config.root,
    mode: config.mode,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
}
