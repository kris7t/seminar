import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin, ResolvedConfig, Rolldown, ViteBuilder } from 'vite';

import {
  ENVIRONMENT_PREFIX,
  findDecks,
  getHtmlPath,
  isEmptyInput,
  removeInputs,
} from './decks.ts';
import { EMOTION_ID, STYLESHEETS_ID, type DeckContent } from './entries.ts';
import { partMarker, writeColophon } from './colophon.ts';
import {
  countImage,
  embedImage,
  imageDefinitions,
  imageTypeName,
  imageElement,
  isImageFile,
  markedImages,
  readDataUri,
  resolveImages,
  imageReference,
  type EmbeddedImage,
  type ImageCounts,
} from './images.ts';
import {
  collectCodePoints,
  parseUnicodeRange,
  pruneFonts,
  type CodePointRange,
} from './fonts.ts';

export interface SelfContainedOptions {
  /**
   * Unicode ranges of fonts to keep, even if no text in the deck needs them,
   * e.g., `['U+0400-04FF']` for Cyrillic text generated at runtime.
   */
  keepUnicodeRanges?: string[] | undefined;
}

/** Id of the element that holds the images embedded into a page. */
const IMAGES_ID = 'seminar-images';

/** Prefix of the ids of the images embedded into a page. */
const IMAGE_PREFIX = 'seminar-image-';

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escapes `</script` and `<!--` in a script, so that it can be inlined into
 * HTML. Both may only occur in strings, regular expressions, and comments,
 * where the escaped forms mean the same.
 */
function escapeScript(code: string): string {
  return code
    .replaceAll(/<\/(script)/gi, '<\\/$1')
    .replaceAll('<!--', '<\\!--');
}

/** Escapes `</style` in a style sheet, so that it can be inlined into HTML. */
function escapeStyle(css: string): string {
  return css.replaceAll(/<\/(style)/gi, '<\\/$1');
}

/** Finds the tags of `html` that refer to `fileName` with `attribute`. */
function tagPattern(tag: string, attribute: string, fileName: string): RegExp {
  return new RegExp(
    `<${tag}\\b[^>]*\\s${attribute}="[^"]*${escapeRegExp(fileName)}"[^>]*>${tag === 'script' ? '\\s*</script>' : ''}`,
    'g',
  );
}

function findPage(
  bundle: Rolldown.OutputBundle,
): Rolldown.OutputAsset | undefined {
  return Object.values(bundle).find(
    (output): output is Rolldown.OutputAsset =>
      output.type === 'asset' && output.fileName.endsWith('.html'),
  );
}

/**
 * Embeds the images that the page uses into it once, in a hidden `svg`
 * element, which both the document and the slides use: the modules of
 * `images` look them up (see {@link imageModule}), and the `img` elements of
 * the document become `svg` elements that use them, with their alt text.
 *
 * @returns The files of the embedded images, and how many images the
 *   document shows.
 */
async function embedImages(
  bundle: Rolldown.OutputBundle,
  images: Map<string, string>,
  warn: (message: string) => void,
): Promise<{ files: string[]; counts: ImageCounts }> {
  const counts: ImageCounts = { count: 0, withoutAlt: 0 };
  const page = findPage(bundle);
  if (page === undefined) {
    return { files: [], counts };
  }
  let html = String(page.source);
  for (const file of markedImages(html)) {
    if (!images.has(file)) {
      images.set(file, `${IMAGE_PREFIX}${String(images.size)}`);
    }
  }
  if (images.size === 0) {
    return { files: [], counts };
  }
  const embedded = new Map<string, EmbeddedImage>();
  const unsized = new Map<string, string>();
  for (const [file, id] of images) {
    try {
      embedded.set(file, await embedImage(file, id));
    } catch (error) {
      warn(
        `The size of ${file} is unknown, so the document of ${page.fileName} has it as a data URI: ${String(error)}`,
      );
      unsized.set(file, await readDataUri(file));
    }
  }
  html = resolveImages(
    html,
    (file, attributes) => {
      countImage(counts, attributes);
      const image = embedded.get(file);
      if (image !== undefined) {
        return imageReference(image, attributes);
      }
      return imageElement(unsized.get(file) ?? '', attributes);
    },
    (file) => embedded.get(file)?.dataUri ?? unsized.get(file) ?? '',
  );
  const definitions = imageDefinitions(IMAGES_ID, [
    ...embedded.values(),
    // Images without a size are still looked up by the slides.
    ...[...unsized].map(([file, dataUri]) => ({
      id: images.get(file) ?? '',
      dataUri,
      width: 0,
      height: 0,
    })),
  ]);
  // After the content and the slides, where they don't cut off the text of
  // the page for tools that only read its beginning.
  const container = `<div id="${EMOTION_ID}"></div>`;
  page.source = html.includes(container)
    ? html.replace(
        container,
        () => `${container}\n${partMarker('images')}${definitions}`,
      )
    : html.replace(
        /<body\b[^>]*>/,
        (tag) => `${tag}\n${partMarker('images')}${definitions}`,
      );
  return { files: [...images.keys()], counts };
}

/** Generates the module of an image, which looks it up in the page. */
function imageModule(id: string): string {
  return `export default document.getElementById(${JSON.stringify(id)})?.getAttribute("href") ?? "";`;
}

/**
 * Inlines the scripts and style sheets of the page in `bundle` into the page,
 * removing them from the bundle, and removes the fonts that the page doesn't
 * need. Other assets are inlined as data URIs by the build options of the
 * environment.
 */
function inlineBundle(
  bundle: Rolldown.OutputBundle,
  keep: readonly CodePointRange[],
  warn: (message: string) => void,
) {
  const outputs = Object.values(bundle);
  const page = findPage(bundle);
  if (page === undefined) {
    return;
  }
  let html = String(page.source);
  const used = collectCodePoints(
    outputs.flatMap((output) => (output.type === 'chunk' ? [output.code] : [])),
  );
  for (const codePoint of collectCodePoints([html], { html: true })) {
    used.add(codePoint);
  }
  // Vite adds the tags to the head, but the inlined code goes into the body,
  // so that the content of the page comes before it.
  const styles: string[] = [];
  const scripts: string[] = [];
  for (const output of outputs) {
    if (output === page) {
      continue;
    }
    const before = html;
    if (output.type === 'chunk') {
      html = html.replace(tagPattern('script', 'src', output.fileName), '');
      if (html !== before) {
        scripts.push(
          `<script type="module">${escapeScript(output.code)}</script>`,
        );
      }
    } else if (output.fileName.endsWith('.css')) {
      html = html.replace(tagPattern('link', 'href', output.fileName), '');
      if (html !== before) {
        const css = pruneFonts(String(output.source), { used, keep });
        styles.push(`<style>${escapeStyle(css)}</style>`);
      }
    }
    const inlined = html !== before;
    if (inlined) {
      // Drop the file, since the page doesn't refer to it any more.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete bundle[output.fileName];
    } else {
      warn(
        `${output.fileName} could not be inlined into ${page.fileName}, so the page is not self-contained`,
      );
    }
  }
  // Scripts first, since the inlined style sheets may contain `</body>`, but
  // the scripts come after the start of the body.
  // With markers of where they start, for the colophon.
  if (scripts[0] !== undefined) {
    scripts[0] = partMarker('scripts') + scripts[0];
  }
  if (styles[0] !== undefined) {
    const fonts = styles.some((style) => style.includes('@font-face'));
    styles[0] = partMarker(fonts ? 'fonts' : 'styles') + styles[0];
  }
  html = html.replace(/<\/body>/, () => [...scripts, '</body>'].join('\n'));
  const container = `<div id="${STYLESHEETS_ID}">`;
  page.source = html.includes(container)
    ? html.replace(container, () => [container, ...styles].join('\n'))
    : // A page of a deck that is not generated.
      html.replace(/<body\b[^>]*>/, (tag) => [tag, ...styles].join('\n'));
}

/** Empties `outDir` like Vite does, keeping `.git`. */
async function emptyDir(outDir: string) {
  const entries = await readdir(outDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry !== '.git')
      .map((entry) =>
        rm(path.join(outDir, entry), { recursive: true, force: true }),
      ),
  );
}

/** Whether Vite would empty the output directory of `config`. */
function shouldEmptyOutDir({ root, build }: ResolvedConfig): boolean {
  if (build.emptyOutDir !== null) {
    return build.emptyOutDir;
  }
  const outDir = path.resolve(root, build.outDir);
  return !path.relative(root, outDir).startsWith('..');
}

/**
 * Builds the generated page of each deck as a single, self-contained HTML
 * file: scripts and style sheets are inlined into the page, and other assets,
 * like fonts and images, are inlined as data URIs. Each deck is bundled in its
 * own build environment, since code shared between pages couldn't be inlined.
 *
 * Fonts are pruned to keep the pages small: WOFF fallbacks of WOFF2 fonts are
 * removed, and so are fonts whose `unicode-range` has no character that occurs
 * in the scripts or the HTML of the page. Text generated at runtime may thus
 * be shown in a fallback font, unless its characters are kept with
 * `keepUnicodeRanges`.
 *
 * Only applies to `vite build` (or `createBuilder().buildApp()`), where the
 * build environments of the decks are built after the other pages of the
 * project. The `build()` API of Vite only builds the client environment,
 * where decks are bundled with the other pages.
 *
 * Files in the `public` directory are not inlined.
 */
export function seminarSelfContained(
  { keepUnicodeRanges = [] }: SelfContainedOptions = {},
  content: DeckContent = 'ssr',
): Plugin {
  const keep = keepUnicodeRanges.flatMap((range) => {
    const parsed = parseUnicodeRange(range);
    if (parsed === undefined) {
      throw new Error(`Invalid Unicode range ${range} in keepUnicodeRanges`);
    }
    return parsed;
  });
  /** The pages of the decks by the names of their build environments. */
  let pages = new Map<string, string>();

  return {
    name: 'seminar:self-contained',
    apply: 'build',

    config(config, { isSsrBuild = false }) {
      if (isSsrBuild) {
        return undefined;
      }
      const root = path.resolve(config.root ?? process.cwd());
      pages = new Map(
        findDecks(root).map((deck, i) => [
          `${ENVIRONMENT_PREFIX}${String(i)}`,
          getHtmlPath(deck),
        ]),
      );
      if (pages.size === 0) {
        return undefined;
      }
      return {
        // Build all environments with `vite build`.
        builder: {},
        environments: Object.fromEntries(
          [...pages.keys()].map((name) => [
            name,
            {
              consumer: 'client',
              build: {
                // The output directory is emptied before the first build.
                emptyOutDir: false,
                copyPublicDir: false,
                assetsInlineLimit: () => true,
                cssCodeSplit: false,
                modulePreload: false,
                rolldownOptions: { output: { codeSplitting: false } },
              },
            },
          ]),
        ),
      };
    },

    async buildApp(builder: ViteBuilder) {
      const { client } = builder.environments;
      const deckPages = new Set(pages.values());
      const clientInput = removeInputs(
        client?.config.build.rolldownOptions.input,
        deckPages,
      );
      if (client !== undefined && !client.isBuilt) {
        // The decks are built in their own environments. Plugins are created
        // anew for each environment, so we can't tell the plugins of the
        // client environment about this, but have to change its config.
        if (clientInput !== undefined) {
          client.config.build.rolldownOptions.input = clientInput;
        }
        if (isEmptyInput(clientInput)) {
          // Only decks: empty the output directory ourselves.
          if (shouldEmptyOutDir(client.config)) {
            await emptyDir(
              path.resolve(client.config.root, client.config.build.outDir),
            );
          }
        } else {
          await builder.build(client);
        }
      }
      for (const name of pages.keys()) {
        const environment = builder.environments[name];
        if (environment !== undefined && !environment.isBuilt) {
          await builder.build(environment);
        }
      }
    },

    applyToEnvironment(environment) {
      const page = pages.get(environment.name);
      if (page === undefined) {
        return false;
      }
      /** The ids of the images embedded into the page, by their files. */
      const images = new Map<string, string>();
      return {
        name: 'seminar:self-contained:deck',
        options(options) {
          return { ...options, input: [page] };
        },
        load: {
          // Before Vite inlines the image into the script.
          order: 'pre',
          handler(id) {
            if (content !== 'ssr' || !isImageFile(id)) {
              return undefined;
            }
            let imageId = images.get(id);
            if (imageId === undefined) {
              imageId = `${IMAGE_PREFIX}${String(images.size)}`;
              images.set(id, imageId);
            }
            return imageModule(imageId);
          },
        },
        generateBundle: {
          // After Vite has emitted the HTML page.
          order: 'post',
          async handler(_options, bundle) {
            const warn = (message: string) => {
              this.warn(message);
            };
            inlineBundle(bundle, keep, warn);
            const { files, counts } = await embedImages(bundle, images, warn);
            const page = findPage(bundle);
            if (page !== undefined) {
              page.source = writeColophon(String(page.source), {
                images: {
                  ...counts,
                  embedded: [...new Set(files.map(imageTypeName))],
                },
              });
            }
          },
        },
      };
    },
  };
}
