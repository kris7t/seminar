import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { readDeckFrontmatter } from '@slider/mdx';
import type { PluggableList } from 'unified';
import type { Plugin } from 'vite';

import {
  DECK_SUFFIX,
  findDecks,
  getDeckPath,
  getHtmlPath,
  HTML_SUFFIX,
  type Input,
} from './decks.ts';

/** Query that marks the script that renders a deck. */
const ENTRY_QUERY = '?slider-entry';

/** Prefix of the virtual modules that render decks. */
const ENTRY_PREFIX = '\0slider-entry:';

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

/** Generates the HTML page for a deck. */
async function renderHtml(
  deckPath: string,
  syntaxPlugins: SyntaxPlugins | undefined,
): Promise<string> {
  const source = await readFile(deckPath, 'utf8');
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
    <title>${escapeHtml(typeof title === 'string' ? title : name.slice(0, -DECK_SUFFIX.length))}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${encodeURI(name)}${ENTRY_QUERY}"></script>
  </body>
</html>
`;
}

/** Generates the module that renders a deck into the page. */
function renderEntry(deckPath: string): string {
  return `import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Deck from ${JSON.stringify(deckPath)};

createRoot(document.getElementById('root')).render(
  createElement(StrictMode, null, createElement(Deck)),
);
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
 * of the frontmatter, where the title defaults to the first heading.
 *
 * Only works with Vite.
 */
export function sliderEntries({
  syntaxPlugins,
}: { syntaxPlugins?: SyntaxPlugins | undefined } = {}): Plugin {
  let root = process.cwd();
  return {
    name: 'slider:entries',
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

    configResolved(config) {
      ({ root } = config);
    },

    resolveId(id, importer) {
      if (id.endsWith(ENTRY_QUERY)) {
        const deck = decodeURI(id.slice(0, -ENTRY_QUERY.length));
        const deckPath = path.isAbsolute(deck)
          ? existsSync(deck)
            ? deck
            : path.join(root, deck)
          : path.resolve(
              importer === undefined ? root : path.dirname(importer),
              deck,
            );
        return ENTRY_PREFIX + deckPath;
      }
      return isGenerated(id) ? id : undefined;
    },

    load(id) {
      if (id.startsWith(ENTRY_PREFIX)) {
        return renderEntry(id.slice(ENTRY_PREFIX.length));
      }
      return isGenerated(id)
        ? renderHtml(getDeckPath(id), syntaxPlugins)
        : undefined;
    },

    configureServer(server) {
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
        renderHtml(getDeckPath(htmlPath), syntaxPlugins)
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
