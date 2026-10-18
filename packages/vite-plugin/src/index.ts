import rollupSlider, {
  type SliderPlugin as RollupSliderPlugin,
  type SliderPluginOptions as RollupSliderPluginOptions,
} from '@slider/rollup-plugin';

import type { Plugin } from 'vite';

import { sliderEntries } from './entries.ts';
import { createViteImporter } from './importModule.ts';
import {
  sliderSelfContained,
  type SelfContainedOptions,
} from './selfContained.ts';

export interface SliderPluginOptions extends RollupSliderPluginOptions {
  /**
   * Whether to turn `.deck.mdx` files into entry points with generated HTML
   * pages (see {@link sliderEntries}). Defaults to `true`.
   */
  entries?: boolean;
  /**
   * Whether `vite build` turns the generated page of each deck into a single,
   * self-contained HTML file, with all scripts, style sheets, fonts, and
   * other assets inlined (see {@link sliderSelfContained}). Defaults to
   * `true`. Disable it, e.g., when hosting decks with a Content Security
   * Policy that forbids inline scripts.
   *
   * Only applies if `entries` is enabled.
   */
  selfContained?: boolean | SelfContainedOptions | undefined;
}

/**
 * Compiles `.deck.mdx` files into `Deck` components (see
 * `@slider/rollup-plugin`) and turns them into entry points with generated
 * HTML pages (see {@link sliderEntries}).
 *
 * Theme modules that aren't packages with a compile-time config are imported
 * with the module runner of Vite to read their `slider` export (see
 * `SliderConfig` in `@slider/core`). This takes about a second, so modules are
 * cached until one of their files changes.
 */
export default function slider({
  entries = true,
  selfContained = true,
  ...options
}: SliderPluginOptions = {}): Plugin[] {
  let root = process.cwd();
  const rollupPlugin: RollupSliderPlugin = rollupSlider({
    // Theme modules may be written in TypeScript and import style sheets.
    importModule: createViteImporter(() => root),
    ...options,
  });
  const mdx = rollupPlugin as unknown as Plugin;
  const setRoot: Plugin = {
    name: 'slider:root',
    configResolved(config) {
      root = config.root;
    },
  };
  if (!entries) {
    return [mdx, setRoot];
  }
  return [
    mdx,
    setRoot,
    sliderEntries({
      syntaxPlugins: (source, deckPath) =>
        rollupPlugin.syntaxPlugins(source, deckPath),
    }),
    ...(selfContained === false
      ? []
      : [sliderSelfContained(selfContained === true ? {} : selfContained)]),
  ];
}

export { sliderEntries, sliderSelfContained, type SelfContainedOptions };
