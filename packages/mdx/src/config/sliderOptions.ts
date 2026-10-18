import path from 'node:path';

import type { VFile } from 'vfile';

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
