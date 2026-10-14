import { readFile } from 'node:fs/promises';
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

import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/js/input/tex/bbox/BboxConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/cases/CasesConfiguration.js';
import '@mathjax/src/js/input/tex/centernot/CenternotConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/empheq/EmpheqConfiguration.js';
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js';
import '@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js';
import '@mathjax/src/js/input/tex/gensymb/GensymbConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/js/input/tex/textcomp/TextcompConfiguration.js';
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js';
import '@mathjax/src/js/input/tex/units/UnitsConfiguration.js';
import '@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js';

import { findPackage } from './packages.ts';

/** TeX packages available in decks. */
const PACKAGES = [
  'base',
  'ams',
  'amscd',
  'boldsymbol',
  'braket',
  'bbox',
  'cancel',
  'cases',
  'centernot',
  'color',
  'configmacros',
  'empheq',
  'enclose',
  'extpfeil',
  'gensymb',
  'mathtools',
  'mhchem',
  'newcommand',
  'physics',
  'textcomp',
  'textmacros',
  'unicode',
  'units',
  'upgreek',
];

export const DEFAULT_FONT = 'newcm';

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

/** Returns the name of the package of a MathJax font, e.g., `fira`. */
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
 * Loads a MathJax font package, looking for it from each of `bases` and then
 * from this package.
 */
function loadFont(font: string, bases: string[]): Promise<Font> {
  const name = getFontPackage(font);
  const directory = [...bases, fileURLToPath(import.meta.url)]
    .map((base) => findPackage(name, base))
    .find((found) => found !== undefined);
  if (directory === undefined) {
    return Promise.reject(
      new Error(
        `Cannot find the MathJax font package ${name}, which should be installed along with the theme`,
      ),
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
    fontCache: 'local',
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
