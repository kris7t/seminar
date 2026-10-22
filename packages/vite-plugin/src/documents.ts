import { createServer, type ResolvedConfig, type ViteDevServer } from 'vite';

import { imageMarkers } from './images.ts';

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
    return cleanDocument(await module.render());
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
