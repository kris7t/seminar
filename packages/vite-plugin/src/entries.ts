import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { readDeckFrontmatter } from '@seminar/mdx';
import type { PluggableList } from 'unified';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';

import {
  DECK_SUFFIX,
  findDecks,
  getDeckPath,
  getHtmlPath,
  HTML_SUFFIX,
  type Input,
} from './decks.ts';
import {
  createDocumentServer,
  DOCUMENT_PREFIX,
  DOCUMENT_QUERY,
  documentRenderer,
  renderDocumentModule,
  type RenderDocument,
} from './documents.ts';

/** Query that marks the script that renders a deck. */
const ENTRY_QUERY = '?seminar-entry';

/**
 * ID of the element at the start of the body that holds the contents of the
 * deck as HTML, for clients without JavaScript, like text extractors.
 */
const CONTENT_ID = 'seminar-content';

/**
 * Media query of environments where the style sheet of the page hides the
 * contents of the deck, since the deck is rendered instead.
 */
const SCRIPTING_QUERY = '(scripting: enabled)';

/**
 * Media query of environments where scripts only run once, like in printing,
 * so the contents of the deck are shown instead of rendering it.
 */
const INITIAL_ONLY_QUERY = '(scripting: initial-only)';

/** ID of the element that the deck is rendered into. */
const ROOT_ID = 'seminar-root';

/**
 * ID of the element in the body of the page that holds the style sheets of
 * self-contained pages, which Vite would otherwise add to the head.
 */
export const STYLESHEETS_ID = 'seminar-stylesheets';

/**
 * ID of the element in the body of the page that holds the styles of Emotion,
 * which would otherwise be added to the head.
 */
const EMOTION_ID = 'seminar-emotion';

/** Prefix of the virtual modules that render decks. */
const ENTRY_PREFIX = '\0seminar-entry:';

/** Whether `file` is inside of the directory `root`, not in a sibling. */
function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Whether `htmlPath` is not a real file, but generated for a deck. */
function isGenerated(htmlPath: string): boolean {
  return (
    htmlPath.endsWith(HTML_SUFFIX) &&
    !existsSync(htmlPath) &&
    existsSync(getDeckPath(htmlPath))
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Returns the remark plugins that extend the syntax of the deck at
 * `deckPath` with `source`, which are needed to parse it.
 */
export type SyntaxPlugins = (
  source: string,
  deckPath: string,
) => Promise<PluggableList>;

/**
 * What the page of a deck starts with, for clients that don't run JavaScript,
 * or only run it once, like text extractors:
 *
 * - `'ssr'`: the deck rendered on the server as a document (see `DeckDocument`
 *   in `@seminar/core`), or its source if that fails.
 * - `'source'`: the MDX source of the deck.
 * - `'none'`: nothing, so that the page only has the deck.
 */
export type DeckContent = 'ssr' | 'source' | 'none';

/**
 * Generates the HTML page for a deck.
 *
 * The page starts with the `content` of the deck. Where the deck is rendered,
 * it is hidden by a media query instead of a script, so it doesn't flash
 * before the deck is rendered, stays in pages saved from the browser, and
 * isn't read by screen readers next to the slides.
 */
async function renderHtml(
  deckPath: string,
  syntaxPlugins: SyntaxPlugins | undefined,
  content: DeckContent,
  renderDocument: () => RenderDocument,
  warn: (message: string) => void,
): Promise<string> {
  const source = await readFile(deckPath, 'utf8');
  const sourceHtml = `<pre>\n${escapeHtml(source)}</pre>`;
  let contentHtml: string | undefined;
  if (content === 'ssr') {
    try {
      contentHtml = await renderDocument()(deckPath);
    } catch (error) {
      warn(
        `${deckPath} could not be rendered as a document, so its page shows the source instead: ${String(error)}`,
      );
      contentHtml = sourceHtml;
    }
  } else if (content === 'source') {
    contentHtml = sourceHtml;
  }
  const { title, lang } = readDeckFrontmatter(
    source,
    deckPath,
    (await syntaxPlugins?.(source, deckPath)) ?? [],
  );
  const name = path.basename(deckPath);
  return `<!doctype html>
<html lang="${escapeHtml(typeof lang === 'string' ? lang : 'en')}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(typeof title === 'string' ? title : name.slice(0, -DECK_SUFFIX.length))}</title>${
      contentHtml === undefined
        ? ''
        : `
    <style>
      @media ${SCRIPTING_QUERY} {
        #${CONTENT_ID} {
          display: none;
        }
      }
    </style>`
    }
  </head>
  <body>${
    contentHtml === undefined
      ? ''
      : `
    <div id="${CONTENT_ID}">${contentHtml}</div>`
  }
    <div id="${ROOT_ID}"></div>
    <div id="${STYLESHEETS_ID}"></div>
    <div id="${EMOTION_ID}"></div>
    <script type="module" src="./${encodeURI(name)}${ENTRY_QUERY}"></script>
  </body>
</html>
`;
}

/**
 * Generates the module that renders a deck into the page, unless the page
 * shows the `content` of the deck instead.
 */
function renderEntry(deckPath: string, content: DeckContent): string {
  const render = `const cache = createCache({
  key: 'css',
  container: document.getElementById(${JSON.stringify(EMOTION_ID)}),
});

createRoot(document.getElementById(${JSON.stringify(ROOT_ID)})).render(
  createElement(
    StrictMode,
    null,
    createElement(CacheProvider, { value: cache }, createElement(Deck)),
  ),
);`;
  return `import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Deck from ${JSON.stringify(deckPath)};

${
  content === 'none'
    ? render
    : `// Browsers that don't support the media queries match neither, but can render
// the deck.
if (!matchMedia(${JSON.stringify(INITIAL_ONLY_QUERY)}).matches) {
  if (!matchMedia(${JSON.stringify(SCRIPTING_QUERY)}).matches) {
    // Not hidden by the style sheet of the page. Unlike an attribute, a rule
    // in the CSSOM isn't kept in pages saved from the browser.
    const style = document.createElement('style');
    document.head.append(style);
    style.sheet.insertRule('#${CONTENT_ID} { display: none; }');
  }

  ${render.replaceAll('\n', '\n  ')}
}`
}
`;
}

/** Adds the HTML pages of `decks` to the inputs of the build. */
function addInputs(
  input: Input | undefined,
  root: string,
  decks: string[],
): Input {
  const pages = decks.map(getHtmlPath);
  if (input === undefined) {
    // Keep the default entry point of Vite, if there is one.
    const index = path.join(root, 'index.html');
    return existsSync(index) && !pages.includes(index)
      ? [index, ...pages]
      : pages;
  }
  if (typeof input === 'string') {
    return [input, ...pages];
  }
  if (Array.isArray(input)) {
    return [...input, ...pages];
  }
  return {
    ...input,
    ...Object.fromEntries(
      pages.map((page) => [
        path.relative(root, page).slice(0, -HTML_SUFFIX.length),
        page,
      ]),
    ),
  };
}

/**
 * Turns `.deck.mdx` files into entry points of Vite: each `name.deck.mdx` gets
 * a generated `name.html` page that renders the deck, unless there is a real
 * `name.html` file. `index.deck.mdx` is served at the root of its directory.
 *
 * The title and language of the page are taken from the `title` and `lang`
 * of the frontmatter, where the title defaults to the first heading. The page
 * starts with the `content` of the deck (see {@link DeckContent}), the deck
 * rendered as a document by default.
 *
 * Only works with Vite.
 */
export function seminarEntries({
  syntaxPlugins,
  content = 'ssr',
}: {
  syntaxPlugins?: SyntaxPlugins | undefined;
  content?: DeckContent | undefined;
} = {}): Plugin {
  let root = process.cwd();
  let config: ResolvedConfig;
  let renderDocument: RenderDocument | undefined;
  let documentServer: Promise<ViteDevServer> | undefined;
  const getRenderDocument = (): RenderDocument => {
    if (renderDocument === undefined) {
      // While building, documents are rendered by a server of our own.
      const server = createDocumentServer(config);
      documentServer = server;
      renderDocument = async (deckPath) =>
        documentRenderer(await server)(deckPath);
    }
    return renderDocument;
  };
  return {
    name: 'seminar:entries',
    enforce: 'pre',

    config(config) {
      root = path.resolve(config.root ?? process.cwd());
      const decks = findDecks(root);
      if (decks.length === 0) {
        return undefined;
      }
      const build = config.build;
      return {
        build: {
          rolldownOptions: {
            input: addInputs(
              build?.rolldownOptions?.input ??
                // Still supported by Vite as an alias.
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                build?.rollupOptions?.input,
              root,
              decks,
            ),
          },
        },
      };
    },

    configResolved(resolved) {
      config = resolved;
      ({ root } = resolved);
    },

    resolveId(id, importer) {
      for (const [query, prefix] of [
        [ENTRY_QUERY, ENTRY_PREFIX],
        [DOCUMENT_QUERY, DOCUMENT_PREFIX],
      ] as const) {
        if (id.endsWith(query)) {
          const deck = decodeURI(id.slice(0, -query.length));
          const deckPath = path.isAbsolute(deck)
            ? existsSync(deck)
              ? deck
              : path.join(root, deck)
            : path.resolve(
                importer === undefined ? root : path.dirname(importer),
                deck,
              );
          return prefix + deckPath;
        }
      }
      return isGenerated(id) ? id : undefined;
    },

    load(id) {
      if (id.startsWith(ENTRY_PREFIX)) {
        return renderEntry(id.slice(ENTRY_PREFIX.length), content);
      }
      if (id.startsWith(DOCUMENT_PREFIX)) {
        return renderDocumentModule(id.slice(DOCUMENT_PREFIX.length));
      }
      if (!isGenerated(id)) {
        return undefined;
      }
      return renderHtml(
        getDeckPath(id),
        syntaxPlugins,
        content,
        getRenderDocument,
        (message) => {
          this.warn(message);
        },
      );
    },

    async buildEnd() {
      const server = documentServer;
      documentServer = undefined;
      renderDocument = undefined;
      await (await server)?.close();
    },

    configureServer(server) {
      renderDocument = documentRenderer(server);
      server.middlewares.use((request, response, next) => {
        if (
          request.url === undefined ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          next();
          return;
        }
        // Malformed escapes throw, which the server answers with an error.
        let pathname = decodeURIComponent(
          new URL(request.url, 'http://localhost').pathname,
        );
        if (pathname.endsWith('/')) {
          pathname += 'index.html';
        }
        // Encoded slashes, like `..%2f`, may lead out of the root.
        const htmlPath = path.join(root, pathname);
        if (!isInside(root, htmlPath) || !isGenerated(htmlPath)) {
          next();
          return;
        }
        renderHtml(
          getDeckPath(htmlPath),
          syntaxPlugins,
          content,
          getRenderDocument,
          (message) => {
            server.config.logger.warn(message);
          },
        )
          .then((html) =>
            server.transformIndexHtml(
              request.url ?? pathname,
              html,
              request.originalUrl,
            ),
          )
          .then((html) => {
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          })
          .catch(next);
      });
    },
  };
}
