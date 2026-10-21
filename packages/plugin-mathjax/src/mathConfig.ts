import type { VFile } from 'vfile';

import { getSeminarOptionLayers } from '@seminar/mdx';

import { DEFAULT_FONT, type MathOptions } from './mathjax.ts';

/**
 * Options for rendering math, which the `math` options of the Seminar configs
 * and the `math` key of the frontmatter set.
 */
export interface MathConfig {
  /**
   * MathJax font to render math with, e.g., `newcm` for New Computer Modern
   * of the `@mathjax/mathjax-newcm-font` package, or the name of a MathJax
   * font package. Defaults to `stix2`, which this plugin depends on. Font
   * packages are found from the config or the deck that sets the font.
   */
  font?: string | undefined;
  /**
   * TeX macros, e.g., `{ R: '\\mathbb{R}', norm: ['\\lVert #1 \\rVert', 1] }`,
   * which are merged.
   */
  macros?: Record<string, string | [string, number]> | undefined;
  /**
   * Which equations are numbered: `ams` numbers the environments that are
   * numbered in LaTeX with `amsmath`, like `equation`. Defaults to `ams`.
   */
  tags?: 'none' | 'ams' | 'all' | undefined;
  /**
   * Whether the deck can show `DynamicFormula`s, which render math in the
   * browser with the font of the deck. `glyphs` lists the files of glyphs of
   * the font that the deck can load, like `latin` or `greek`, besides those
   * that the font always has. Defaults to all of them.
   */
  dynamic?: boolean | { glyphs?: string[] | undefined } | undefined;
}

/** Options of math in the browser, after validation. */
export interface DynamicMathConfig {
  /** The files of glyphs to load, or all of them if `undefined`. */
  glyphs: string[] | undefined;
}

/** Options of math of a deck, after validation and merging. */
export interface DeckMathOptions extends MathOptions {
  /** Options of math in the browser, if enabled. */
  dynamic: DynamicMathConfig | undefined;
  /** Paths to look for the font package from, the latest config first. */
  bases: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMacro(value: unknown): value is string | [string, number] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'number')
  );
}

function parseDynamic(
  dynamic: unknown,
  source: string,
  file: VFile,
): MathConfig['dynamic'] {
  if (typeof dynamic === 'boolean' || dynamic === undefined) {
    return dynamic;
  }
  if (!isRecord(dynamic)) {
    file.message(
      `Expected \`dynamic\` of ${source} to be a boolean or a mapping`,
    );
    return undefined;
  }
  const { glyphs } = dynamic;
  if (glyphs === undefined) {
    return {};
  }
  if (
    Array.isArray(glyphs) &&
    glyphs.every((glyph) => typeof glyph === 'string')
  ) {
    return { glyphs: glyphs };
  }
  file.message(
    `Expected \`glyphs\` of \`dynamic\` of ${source} to be a list of names`,
  );
  return {};
}

/**
 * Validates math options given by `source`, reporting invalid ones.
 */
function parseMathConfig(
  value: unknown,
  source: string,
  file: VFile,
): MathConfig {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    file.message(`Expected ${source} to be a mapping`);
    return {};
  }
  const config: MathConfig = {};
  const { font, macros, tags, dynamic } = value;
  if (typeof font === 'string') {
    config.font = font;
  } else if (font !== undefined) {
    file.message(`Expected \`font\` of ${source} to be a string`);
  }
  if (isRecord(macros)) {
    config.macros = {};
    for (const [name, macro] of Object.entries(macros)) {
      if (isMacro(macro)) {
        config.macros[name] = macro;
      } else {
        file.message(
          `Expected the macro \`${name}\` in ${source} to be a string or a [definition, arguments] pair`,
        );
      }
    }
  } else if (macros !== undefined) {
    file.message(`Expected \`macros\` of ${source} to be a mapping`);
  }
  if (tags === 'none' || tags === 'ams' || tags === 'all') {
    config.tags = tags;
  } else if (tags !== undefined) {
    file.message(
      `Expected \`tags\` of ${source} to be \`none\`, \`ams\`, or \`all\``,
    );
  }
  config.dynamic = parseDynamic(dynamic, source, file);
  return config;
}

function toDynamic(
  dynamic: MathConfig['dynamic'],
): DynamicMathConfig | undefined {
  if (dynamic === undefined || dynamic === false) {
    return undefined;
  }
  return { glyphs: dynamic === true ? undefined : dynamic.glyphs };
}

/**
 * Reads the `math` options of the Seminar configs and the frontmatter of a
 * deck, in order of increasing precedence, reporting invalid ones.
 */
export function readMathOptions(file: VFile): DeckMathOptions {
  const layers = getSeminarOptionLayers(file, 'math');
  const options: DeckMathOptions = {
    font: DEFAULT_FONT,
    macros: {},
    tags: 'ams',
    dynamic: undefined,
    // Fonts are found from the configs that set them, the latest first.
    bases: layers.map(({ base }) => base).reverse(),
  };
  for (const { options: value, source } of layers) {
    const { font, macros, tags, dynamic } = parseMathConfig(
      value,
      source,
      file,
    );
    options.font = font ?? options.font;
    options.macros = { ...options.macros, ...macros };
    options.tags = tags ?? options.tags;
    if (dynamic !== undefined) {
      options.dynamic = toDynamic(dynamic);
    }
  }
  return options;
}
