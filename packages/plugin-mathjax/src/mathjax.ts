import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { AssistiveMmlHandler } from '@mathjax/src/js/a11y/assistive-mml.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import '@mathjax/src/js/util/asyncLoad/esm.js';

import { findPackage } from './packages.ts';
import { PACKAGES } from './texPackages.ts';

/** Font of math without a `font` option, which this package depends on. */
export const DEFAULT_FONT = 'stix2';

const adaptor = liteAdaptor();
AssistiveMmlHandler(RegisterHTMLHandler(adaptor));

/** Options for rendering math, after validation. */
export interface MathOptions {
  font: string;
  macros: Record<string, string | [string, number]>;
  tags: 'none' | 'ams' | 'all';
}

/** Renders TeX to the HTML of a MathJax container, or reports an error. */
export type MathRenderer = (
  tex: string,
  display: boolean,
  onError: (message: string) => void,
) => string;

interface Font {
  fontData: unknown;
  dynamicPrefix: string;
}

const fonts = new Map<string, Promise<Font>>();

/** Returns the name of the package of a MathJax font, e.g., `stix2`. */
export function getFontPackage(font: string): string {
  return font.includes('/') ? font : `@mathjax/mathjax-${font}-font`;
}

async function importFont(directory: string): Promise<Font> {
  const module = (await import(
    pathToFileURL(path.join(directory, 'mjs', 'svg.js')).href
  )) as Record<string, unknown>;
  const fontData = Object.values(module).find(
    (value) => typeof value === 'function',
  );
  if (fontData === undefined) {
    const { name } = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    ) as { name?: string };
    throw new Error(`The package ${name ?? directory} is not a MathJax font`);
  }
  return {
    fontData,
    // Load the glyphs of the font from where we found it, not from where
    // MathJax is installed.
    dynamicPrefix: pathToFileURL(path.join(directory, 'mjs', 'svg', 'dynamic'))
      .href,
  };
}

/**
 * Finds the directory of a MathJax font package, looking for it from each of
 * `bases` and then from this package.
 */
export function findFontPackage(font: string, bases: string[]): string {
  const name = getFontPackage(font);
  const directory = [...bases, fileURLToPath(import.meta.url)]
    .map((base) => findPackage(name, base))
    .find((found) => found !== undefined);
  if (directory === undefined) {
    throw new Error(
      `Cannot find the MathJax font package ${name}, which should be installed along with the theme`,
    );
  }
  return directory;
}

/** Lists the files of glyphs that a font package loads when needed. */
export async function listDynamicFiles(directory: string): Promise<string[]> {
  const files = await readdir(path.join(directory, 'mjs', 'svg', 'dynamic'));
  return files.filter((file) => file.endsWith('.js')).sort();
}

/** Loads a MathJax font package (see {@link findFontPackage}). */
function loadFont(font: string, bases: string[]): Promise<Font> {
  let directory;
  try {
    directory = findFontPackage(font, bases);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  let loaded = fonts.get(directory);
  if (loaded === undefined) {
    loaded = importFont(directory);
    fonts.set(directory, loaded);
  }
  return loaded;
}

/**
 * Creates a renderer for the formulas of a deck. Equation numbers and labels
 * are shared by the formulas rendered with the same renderer.
 *
 * @param bases Paths to look for the font package from.
 */
export async function createMathRenderer(
  { font, macros, tags }: MathOptions,
  bases: string[],
  {
    fontCache = 'local',
  }: {
    /**
     * Where formulas keep their glyphs: in definitions of their own, which
     * they refer to by ids, or in their paths, without ids.
     */
    fontCache?: 'local' | 'none';
  } = {},
): Promise<MathRenderer> {
  const { fontData, dynamicPrefix } = await loadFont(font, bases);
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
    dynamicPrefix,
    // Each formula has its own copies of the glyphs, since slides are
    // rendered separately.
    fontCache,
    linebreaks: { inline: false },
  });
  // Load all glyphs up front, since MathJax would otherwise restart the
  // rendering of formulas that need more glyphs, defining labels twice.
  await svg.font.loadDynamicFiles();
  const document = mathjax.document('', { InputJax: tex, OutputJax: svg });
  return (source, display, onError) => {
    reportError = onError;
    try {
      return adaptor.outerHTML(
        document.convert(source, { display }) as LiteElement,
      );
    } finally {
      reportError = undefined;
    }
  };
}
