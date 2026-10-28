import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  deckMarkdown,
  getDeckMetadata,
  readDeckFrontmatter,
  type DeckMetadata,
} from '@seminar/mdx';
import type { PluggableList } from 'unified';
import {
  defaultClientConditions,
  defaultServerConditions,
  type Plugin,
  type ResolvedConfig,
  type Rolldown,
  type UserConfig,
  type ViteDevServer,
} from 'vite';

import {
  DECK_SUFFIX,
  ENVIRONMENT_PREFIX,
  findDecks,
  getDeckPath,
  getHtmlPath,
  HTML_SUFFIX,
  type Input,
} from '../decks.ts';
import {
  createDocumentServer,
  DOCUMENT_PREFIX,
  DOCUMENT_QUERY,
  documentRenderer,
  renderDocumentModule,
  type RenderDocument,
} from './documents.ts';
import { colophonStart, renderedNote, writeColophon } from './colophon.ts';
import {
  countImage,
  imageElement,
  isImageFile,
  markedImages,
  markReference,
  readDataUri,
  resolveImages,
  type ImageCounts,
} from '../inline/images.ts';
import {
  COLOPHON_ID,
  CONTENT_END,
  CONTENT_ID,
  EMOTION_ID,
  MAIN_ID,
  MARKDOWN_END,
  MARKDOWN_ID,
  RENDERED_NOTE_ID,
  ROOT_ID,
  SKIP_ID,
  SLIDES_ID,
  STYLESHEETS_ID,
} from './ids.ts';
import { otherLang, readPageMessages } from './messages.ts';

/** Query that marks the script that renders a deck. */
const ENTRY_QUERY = '?seminar-entry';

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

/**
 * Shows the link that skips to the content over the rendered deck. Since it's
 * only needed once the link is focused, it's with the other style sheets after
 * the deck, so that the start of the page, which tools read first, stays short.
 */
const SKIP_FOCUS_STYLE = `#${SKIP_ID}:focus { position: fixed; top: 0; left: 0; z-index: 2147483647; padding: 0.5em 1em; background: white; color: black; }`;

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

function unescapeHtml(text: string): string {
  return text.replaceAll(
    /&(amp|lt|gt|quot|#x27);/g,
    (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" })[entity] ?? '',
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
 * Returns the name of the first component in `markdown`, e.g., `Step` for
 * `<Step>`, outside of code, if any.
 */
function findComponent(markdown: string): string | undefined {
  const text = markdown
    .replaceAll(/^ {0,3}(`{3,}|~{3,})[^]*?^ {0,3}\1[`~]*[ \t]*$/gm, '')
    .replaceAll(/(`+)[^]*?\1/g, '');
  return /<([A-Z][\w.]*)(?=[\s/>])/.exec(text)?.[1];
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
 *   in `@seminar/core`), or its Markdown if that fails.
 * - `'markdown'`: the source of the deck as Markdown that reads as plain
 *   text, without comments and with the slides it includes from other decks
 *   (see `deckMarkdown` in `@seminar/mdx`).
 * - `'both'`: the document, after its Markdown collapsed in a `details`
 *   element, or only its Markdown if rendering the document fails.
 * - `'none'`: nothing, so that the page only has the deck.
 */
export type DeckContent = 'ssr' | 'markdown' | 'both' | 'none';

/**
 * Generates the HTML page for a deck.
 *
 * The page starts with the `content` of the deck. Where the deck is rendered,
 * it is hidden by a media query instead of a script, so it doesn't flash
 * before the deck is rendered, stays in pages saved from the browser, and
 * isn't read by screen readers next to the slides.
 *
 * With `referImages`, the images of the Markdown of the deck refer to the
 * images of the build, i.e., their assets, or the images embedded into
 * self-contained pages (see `seminarSelfContained`).
 */
async function renderHtml(
  deckPath: string,
  syntaxPlugins: SyntaxPlugins | undefined,
  content: DeckContent,
  renderDocument: () => RenderDocument,
  warn: (message: string) => void,
  referImages = false,
): Promise<string> {
  const source = await readFile(deckPath, 'utf8');
  const plugins = (await syntaxPlugins?.(source, deckPath)) ?? [];
  const frontmatter = readDeckFrontmatter(source, deckPath, plugins);
  const { title, lang } = frontmatter;
  const name = path.basename(deckPath);
  const pageTitle =
    typeof title === 'string' ? title : name.slice(0, -DECK_SUFFIX.length);
  const pageLang = typeof lang === 'string' ? lang : 'en';
  const { skipToContent, aboutPage, markdownSource } = await readPageMessages(
    frontmatter,
    deckPath,
  );
  const deck = {
    title: pageTitle,
    lang: typeof lang === 'string' ? lang : undefined,
    label: aboutPage.text,
    labelLang: otherLang(aboutPage, pageLang),
  };
  const skipLang = otherLang(skipToContent, pageLang);
  const markdown = (): string | undefined => {
    try {
      return deckMarkdown(source, deckPath, {
        syntaxPlugins: plugins,
        imageUrl: referImages
          ? (file) =>
              isImageFile(file) && existsSync(file)
                ? markReference(file)
                : undefined
          : undefined,
      });
    } catch (error) {
      warn(
        `${deckPath} could not be turned into Markdown, so its page leaves it out: ${String(error)}`,
      );
      return undefined;
    }
  };
  let documentHtml: string | undefined;
  if (content === 'ssr' || content === 'both') {
    try {
      documentHtml = await renderDocument()(deckPath);
    } catch (error) {
      warn(
        `${deckPath} could not be rendered as a document, so its page shows its Markdown instead: ${String(error)}`,
      );
    }
  }
  const markdownText =
    content === 'markdown' ||
    content === 'both' ||
    (content === 'ssr' && documentHtml === undefined)
      ? markdown()
      : undefined;
  const markdownHtml =
    markdownText === undefined
      ? undefined
      : `<pre id="${MARKDOWN_ID}">\n${escapeHtml(markdownText)}</pre>`;
  let contentHtml: string | undefined;
  if (documentHtml !== undefined) {
    // React escapes text and attributes, so only the sections of slides,
    // their notes, their headings, and MathML match these.
    const example = /<h[1-4] id="([^"]*)"/.exec(documentHtml)?.[1];
    const start = colophonStart({
      kind: markdownHtml === undefined ? 'document' : 'both',
      ...deck,
      slides: documentHtml.split(' data-seminar-slide=').length - 1,
      example: example === undefined ? undefined : unescapeHtml(example),
      notes: documentHtml.includes(' data-seminar-notes='),
      formulas: documentHtml.match(/<math[\s>]/g)?.length ?? 0,
      component:
        markdownText === undefined ? undefined : findComponent(markdownText),
    });
    // The Markdown is collapsed before the document, like the colophon.
    const markdownLang = otherLang(markdownSource, pageLang);
    const collapsed =
      markdownHtml === undefined
        ? ''
        : `<details><summary${
            markdownLang === undefined
              ? ''
              : ` lang="${escapeHtml(markdownLang)}"`
          }>${escapeHtml(markdownSource.text)}</summary>${markdownHtml}</details>${MARKDOWN_END}`;
    contentHtml = `${start}${collapsed}<main id="${MAIN_ID}">${documentHtml}</main>${CONTENT_END}`;
  } else if (markdownHtml !== undefined) {
    contentHtml = `${colophonStart({
      kind: 'markdown',
      ...deck,
      component:
        markdownText === undefined ? undefined : findComponent(markdownText),
    })}<main id="${MAIN_ID}">${markdownHtml}</main>${CONTENT_END}`;
  }
  return `<!doctype html>
<html lang="${escapeHtml(pageLang)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>${metaTags(pageTitle, getDeckMetadata(frontmatter))}
    <style>
      #${SKIP_ID}:not(:focus) {
        position: absolute;
        clip-path: inset(50%);
      }${
        contentHtml === undefined
          ? ''
          : `
      @media ${SCRIPTING_QUERY} {
        #${CONTENT_ID} {
          display: none;
        }
      }`
      }
    </style>
  </head>
  <body>
    <a id="${SKIP_ID}" href="#${contentHtml === undefined ? SLIDES_ID : MAIN_ID}"${
      skipLang === undefined ? '' : ` lang="${escapeHtml(skipLang)}"`
    }>${escapeHtml(skipToContent.text)}</a>${
      contentHtml === undefined
        ? ''
        : `
    <div id="${CONTENT_ID}">${contentHtml}</div>`
    }
    <div id="${ROOT_ID}"></div>
    <div id="${STYLESHEETS_ID}">
      <style>
        ${SKIP_FOCUS_STYLE}
      </style>
    </div>
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

  // The link at the start of the page skips to the slides instead.
  document.getElementById(${JSON.stringify(SKIP_ID)})?.setAttribute('href', ${JSON.stringify(`#${SLIDES_ID}`)});

  // Unless the page was saved from the browser with it.
  const colophon = document.getElementById(${JSON.stringify(COLOPHON_ID)});
  if (colophon !== null && document.getElementById(${JSON.stringify(RENDERED_NOTE_ID)}) === null) {
    colophon.insertAdjacentHTML('beforeend', ${JSON.stringify(renderedNote(ROOT_ID))});
  }

  ${render.replaceAll('\n', '\n  ')}
}`
}
`;
}

/**
 * Returns the URL of the asset of the image at `file` in `bundle` from the
 * page `pageName`, if Vite emitted one.
 */
function assetUrl(
  bundle: Rolldown.OutputBundle,
  file: string,
  pageName: string,
  { root, base }: ResolvedConfig,
): string | undefined {
  const asset = Object.values(bundle).find(
    (output) =>
      output.type === 'asset' &&
      output.originalFileNames.some(
        (name) => path.resolve(root, name) === file,
      ),
  );
  if (asset === undefined) {
    return undefined;
  }
  // Like Vite, relative to the page with a relative base.
  return base === '' || base.startsWith('.')
    ? path.posix.relative(path.posix.dirname(pageName), asset.fileName)
    : `${base}${asset.fileName}`;
}

/**
 * Returns the options that resolve modules for the server, which render the
 * documents of decks, with the export conditions that `config` adds to those
 * of the client, e.g., to use the sources of workspace packages, unless it
 * sets the conditions of the server itself.
 *
 * Only for serving, since setting options of the server makes `vite build`
 * build for the server, too.
 */
function serverResolveOptions(config: UserConfig): UserConfig['ssr'] {
  const conditions = config.resolve?.conditions?.filter(
    (condition) => !defaultClientConditions.includes(condition),
  );
  if (
    conditions === undefined ||
    conditions.length === 0 ||
    config.ssr?.resolve?.conditions !== undefined ||
    config.environments?.['ssr']?.resolve?.conditions !== undefined
  ) {
    return undefined;
  }
  return {
    resolve: { conditions: [...conditions, ...defaultServerConditions] },
  };
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
 * Returns the meta tags of the page of a deck with `metadata`, each on a line
 * of its own, which tell search engines and previews of links about it.
 */
function metaTags(title: string, metadata: DeckMetadata): string {
  const { authors = [], description, keywords } = metadata;
  const tags = [
    ...(description === undefined
      ? []
      : [['name', 'description', description]]),
    ...authors.map((author) => ['name', 'author', author]),
    ...(keywords === undefined
      ? []
      : [['name', 'keywords', keywords.join(', ')]]),
    ['property', 'og:title', title],
    ...(description === undefined
      ? []
      : [['property', 'og:description', description]]),
  ];
  return tags
    .map(
      ([attribute = '', name = '', content = '']) =>
        `\n    <meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`,
    )
    .join('');
}

/**
 * Turns `.deck.mdx` files into entry points of Vite: each `name.deck.mdx` gets
 * a generated `name.html` page that renders the deck, unless there is a real
 * `name.html` file. `index.deck.mdx` is served at the root of its directory.
 *
 * The title and language of the page are taken from the `title` and `lang`
 * of the frontmatter, where the title defaults to the first heading, and its
 * meta tags from the `description`, `author`, and `keywords`. The page
 * starts with the `content` of the deck (see {@link DeckContent}), both its
 * Markdown and the deck rendered as a document by default.
 *
 * Only works with Vite.
 */
export function seminarEntries({
  syntaxPlugins,
  content = 'both',
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

    config(config, { command }) {
      root = path.resolve(config.root ?? process.cwd());
      const decks = findDecks(root);
      if (decks.length === 0) {
        return undefined;
      }
      const build = config.build;
      const ssr =
        (content === 'ssr' || content === 'both') && command === 'serve'
          ? serverResolveOptions(config)
          : undefined;
      return {
        ...(ssr === undefined ? {} : { ssr }),
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
        config.command === 'build',
      );
    },

    generateBundle: {
      // After Vite has emitted the HTML pages.
      order: 'post',
      async handler(_options, bundle) {
        // Self-contained pages embed their images on their own.
        if (this.environment.name.startsWith(ENVIRONMENT_PREFIX)) {
          return;
        }
        for (const page of Object.values(bundle)) {
          if (page.type !== 'asset' || !page.fileName.endsWith('.html')) {
            continue;
          }
          const html = String(page.source);
          // The URLs of the images of the document, or their data URIs if
          // Vite inlined them into the scripts.
          const urls = new Map<string, string>();
          for (const file of markedImages(html, false)) {
            urls.set(
              file,
              assetUrl(bundle, file, page.fileName, config) ??
                (await readDataUri(file)),
            );
          }
          const images: ImageCounts = { count: 0, withoutAlt: 0 };
          const references: ImageCounts = { count: 0, withoutAlt: 0 };
          const resolved = resolveImages(
            html,
            (file, attributes) => {
              countImage(images, attributes);
              return imageElement(urls.get(file) ?? '', attributes);
            },
            (file) => urls.get(file) ?? '',
            // The Markdown links to the images instead of embedding them,
            // where they are next to the deck if Vite didn't emit them.
            (file) => {
              references.count += 1;
              return (
                assetUrl(bundle, file, page.fileName, config) ??
                path
                  .relative(path.join(root, path.dirname(page.fileName)), file)
                  .split(path.sep)
                  .join('/')
              );
            },
          );
          page.source = writeColophon(resolved, {
            images,
            markdownImages: references,
          });
        }
      },
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
            response.end(writeColophon(html));
          })
          .catch(next);
      });
    },
  };
}
