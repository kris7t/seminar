/**
 * Renders math in the browser. Decks with dynamic math import this module
 * when a `DynamicFormula` is first probed or shown, so that other decks don't
 * contain MathJax.
 */

import type {
  LiteElement,
  LiteNode,
} from '@mathjax/src/js/adaptors/lite/Element.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { AssistiveMmlHandler } from '@mathjax/src/js/a11y/assistive-mml.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import type { DynamicFile } from '@mathjax/src/js/output/common/FontData.js';
import { SVG } from '@mathjax/src/js/output/svg.js';

import { PACKAGES } from '../texPackages.ts';
import type { MathFont } from './fonts.ts';

/** Options for rendering a formula in the browser. */
export interface RenderOptions {
  display: boolean;
  font: MathFont;
  macros: Record<string, string | [string, number]>;
  tags: 'none' | 'ams' | 'all';
  onError?: ((message: string) => void) | undefined;
}

/** A rendered formula, as the props of `Formula`. */
export interface RenderedFormula {
  svg: string;
  mathml: string | undefined;
  fullWidth: boolean;
  minWidth: string | undefined;
}

const adaptor = liteAdaptor();
AssistiveMmlHandler(RegisterHTMLHandler(adaptor));

async function importFontData(font: MathFont): Promise<unknown> {
  const module = (await font.loadFont()) as Record<string, unknown>;
  const fontData = Object.values(module).find(
    (value) => typeof value === 'function',
  );
  if (fontData === undefined) {
    throw new Error('The font module does not export a MathJax font');
  }
  return fontData;
}

/**
 * Makes `fontData` load more glyphs with `font`, as MathJax does with
 * `mathjax.asyncLoad` otherwise. That would need the copy of MathJax that
 * the font imports to be the same as this one, which it isn't, e.g., in the
 * dev server of Vite, which bundles MathJax for this module, but not for the
 * font that decks import.
 */
function loadGlyphsWith(fontData: unknown, font: MathFont): void {
  const instance = fontData as {
    loadDynamicFile: (dynamic: DynamicFile) => Promise<void>;
  };
  const loadExtension = instance.loadDynamicFile.bind(instance);
  instance.loadDynamicFile = async (dynamic) => {
    if (dynamic.extension !== '') {
      // Glyphs of TeX extensions, which the font doesn't have.
      return loadExtension(dynamic);
    }
    if (dynamic.failed) {
      throw new Error(`Cannot load the glyphs ${dynamic.file}`);
    }
    // MathJax sets the promise once it starts loading the file.
    const loading = dynamic as { promise?: Promise<void> };
    // The glyphs that are not loaded show as missing.
    loading.promise ??= font.loadDynamicFile(`${dynamic.file}.js`).then(
      () => undefined,
      (error: unknown) => {
        dynamic.failed = true;
        console.warn(error);
      },
    );
    await loading.promise;
    dynamic.setup(fontData as never);
  };
}

type Renderer = (
  tex: string,
  options: RenderOptions,
) => Promise<RenderedFormula>;

const renderers = new Map<MathFont, Map<string, Promise<Renderer>>>();

async function createRenderer({
  font,
  macros,
  tags,
}: RenderOptions): Promise<Renderer> {
  const fontData = await importFontData(font);
  let reportError: ((message: string) => void) | undefined;
  const tex = new TeX({
    packages: PACKAGES,
    macros,
    tags,
    formatError(
      jax: TeX<unknown, unknown, unknown>,
      error: Parameters<TeX<unknown, unknown, unknown>['formatError']>[0],
    ) {
      reportError?.(error.message);
      return jax.formatError(error);
    },
  });
  const svg = new SVG({
    fontData,
    fontCache: 'local',
    linebreaks: { inline: false },
  });
  loadGlyphsWith(svg.font, font);
  const document = mathjax.document('', { InputJax: tex, OutputJax: svg });
  // Formulas are rendered one at a time, since loading glyphs restarts them,
  // and the errors are reported to the formula being rendered.
  let queue: Promise<unknown> = Promise.resolve();
  return (source, { display, onError }) => {
    const rendered = queue.then(async () => {
      reportError = onError;
      try {
        // Each formula is numbered on its own.
        tex.reset();
        const container = (await document.convertPromise(source, {
          display,
        })) as LiteElement;
        return toFormula(container);
      } finally {
        reportError = undefined;
      }
    });
    queue = rendered.catch(() => undefined);
    return rendered;
  };
}

function getRenderer(options: RenderOptions): Promise<Renderer> {
  let byOptions = renderers.get(options.font);
  if (byOptions === undefined) {
    byOptions = new Map();
    renderers.set(options.font, byOptions);
  }
  const key = JSON.stringify([options.macros, options.tags]);
  let renderer = byOptions.get(key);
  if (renderer === undefined) {
    renderer = createRenderer(options);
    // Try again with the next formula if the font fails to load.
    renderer.catch(() => byOptions.delete(key));
    byOptions.set(key, renderer);
  }
  return renderer;
}

function isElement(node: LiteNode): node is LiteElement {
  return adaptor.kind(node) !== '#text' && adaptor.kind(node) !== '#comment';
}

/**
 * Removes the attributes that MathJax only needs for interactive features,
 * like the compiler does.
 */
function cleanSvg(node: LiteElement): void {
  for (const child of [...adaptor.childNodes(node)]) {
    if (isElement(child)) {
      cleanSvg(child);
      // Links of `\eqref` would navigate away from the slide.
      if (adaptor.kind(child) === 'a') {
        for (const grandchild of [...adaptor.childNodes(child)]) {
          adaptor.insert(grandchild, child);
        }
        adaptor.remove(child);
      }
    }
  }
  adaptor.removeAttribute(node, 'data-latex');
  adaptor.removeAttribute(node, 'data-mml-node');
  adaptor.removeAttribute(node, 'data-c');
}

function cleanMathml(node: LiteElement, root: boolean): void {
  adaptor.removeAttribute(node, 'href');
  if (!root) {
    adaptor.removeAttribute(node, 'data-latex');
  }
  for (const child of adaptor.childNodes(node)) {
    if (isElement(child)) {
      cleanMathml(child, false);
    }
  }
}

function toFormula(container: LiteElement): RenderedFormula {
  const [svg] = adaptor.tags(container, 'svg');
  const [math] = adaptor.tags(container, 'math');
  if (svg !== undefined) {
    cleanSvg(svg);
  }
  if (math !== undefined) {
    cleanMathml(math, true);
  }
  const fullWidth = adaptor.getAttribute(container, 'width') === 'full';
  const style = adaptor.getAttribute(container, 'style') as unknown;
  const minWidth =
    fullWidth && typeof style === 'string'
      ? /min-width:\s*([^;]+)/.exec(style)?.[1]?.trim()
      : undefined;
  return {
    svg: svg === undefined ? '' : adaptor.outerHTML(svg),
    mathml: math === undefined ? undefined : adaptor.outerHTML(math),
    fullWidth,
    minWidth,
  };
}

/** Renders TeX to the props of a `Formula`, with SVG and MathML. */
export async function renderFormula(
  tex: string,
  options: RenderOptions,
): Promise<RenderedFormula> {
  const render = await getRenderer(options);
  return render(tex, options);
}
