import path from 'node:path';

import type { Program } from 'estree';
import type { VFile } from 'vfile';

import { parseProgram } from '../utils/estree.ts';
import { SLIDER_OPTIONS } from '../utils/jsx.ts';
import { getSliderConfigs } from './remarkSliderConfig.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the frontmatter of the deck that `file` compiles. */
export function getFrontmatter(file: VFile): Record<string, unknown> {
  const { sliderFrontmatter } = file.data as {
    sliderFrontmatter?: Record<string, unknown>;
  };
  return sliderFrontmatter ?? {};
}

/** The options called some name that a config or the frontmatter sets. */
export interface SliderOptionsLayer {
  /** The options. */
  options: Record<string, unknown>;
  /**
   * Path to resolve files and packages that the options name from: the
   * config of a plugin or theme, or the deck for the frontmatter.
   */
  base: string;
  /** Where the options are set, for messages. */
  source: string;
}

/**
 * Returns the options called `name` that the configs of the plugins and the
 * theme of the deck that `file` compiles, and the key `name` of its
 * frontmatter set, in order of increasing precedence, e.g., to resolve the
 * files they name, or to merge lists (see `SliderConfig` in `@slider/core`).
 *
 * Must be called after `remarkSlides` and `remarkSliderConfig`, which read
 * the frontmatter and the configs, e.g., in plugins of the `mdx` config.
 */
export function getSliderOptionLayers(
  file: VFile,
  name: string,
): SliderOptionsLayer[] {
  const layers = [
    ...(getSliderConfigs(file) ?? []).map(({ source, config, base }) => ({
      source: `\`options.${name}\` in the config of ${source}`,
      base,
      value:
        isRecord(config) && isRecord(config['options'])
          ? config['options'][name]
          : undefined,
    })),
    {
      source: `\`${name}\` in the frontmatter`,
      base: file.path || path.resolve('deck.mdx'),
      value: getFrontmatter(file)[name],
    },
  ];
  return layers.flatMap(({ source, base, value }) => {
    if (value === undefined) {
      return [];
    }
    if (!isRecord(value)) {
      file.message(`Expected ${source} to be an object`);
      return [];
    }
    return [{ options: value, base, source }];
  });
}

/**
 * Returns the options called `name` of the deck that `file` compiles, as
 * the `options` of the configs of the plugins and the theme, and the key
 * `name` of the frontmatter set them, in order of increasing precedence
 * (see `SliderConfig` in `@slider/core`). Their keys are merged, so later
 * ones replace earlier ones as a whole. See {@link getSliderOptionLayers}
 * for the options as each of them sets them.
 */
export function getSliderOptions(
  file: VFile,
  name: string,
): Record<string, unknown> {
  return Object.assign(
    {},
    ...getSliderOptionLayers(file, name).map(({ options }) => options),
  ) as Record<string, unknown>;
}

/** Code of options in the browser that plugins set, by their name. */
function getRuntimeOptions(file: VFile): Map<string, string> {
  const data = file.data as { sliderRuntimeOptions?: Map<string, string> };
  data.sliderRuntimeOptions ??= new Map();
  return data.sliderRuntimeOptions;
}

/**
 * Sets the options called `name` of the deck that `file` compiles in the
 * browser, where components read them with `useSliderOptions` of
 * `@slider/core`, to the value of the JavaScript expression `code`, e.g., to
 * merge them differently, or to add functions that import modules. The code
 * can use the imports that the plugin adds to the deck.
 *
 * Otherwise, the deck has the options as {@link getSliderOptions} returns
 * them. Must be called before the plugins of recma run, e.g., in plugins of
 * rehype.
 */
export function setRuntimeSliderOptions(
  file: VFile,
  name: string,
  code: string,
): void {
  getRuntimeOptions(file).set(name, code);
}

/**
 * Declares the options of the deck that `file` compiles for the browser,
 * which the `Deck` gets: those that the configs set, and those that plugins
 * set with {@link setRuntimeSliderOptions}.
 */
export function recmaSliderOptions(): (tree: Program, file: VFile) => void {
  return (tree, file) => {
    const names = new Set<string>();
    for (const { config } of getSliderConfigs(file) ?? []) {
      if (isRecord(config) && isRecord(config['options'])) {
        for (const name of Object.keys(config['options'])) {
          names.add(name);
        }
      }
    }
    const runtime = getRuntimeOptions(file);
    const entries = [...names]
      .filter((name) => !runtime.has(name))
      .map(
        (name) =>
          `${JSON.stringify(name)}: ${JSON.stringify(getSliderOptions(file, name))}`,
      );
    for (const [name, code] of runtime) {
      entries.push(`${JSON.stringify(name)}: (${code})`);
    }
    // Before the content, which uses them, and after the imports, which
    // the options may use, even when the imports are compiled to statements.
    const index = tree.body.findIndex(
      (statement) =>
        statement.type === 'FunctionDeclaration' &&
        statement.id.name === '_createMdxContent',
    );
    tree.body.splice(
      index === -1 ? tree.body.length : index,
      0,
      ...parseProgram(`const ${SLIDER_OPTIONS} = { ${entries.join(', ')} };`)
        .body,
    );
  };
}
