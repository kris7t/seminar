import rollupSlider, {
  type SliderPluginOptions as RollupSliderPluginOptions,
} from '@slider/rollup-plugin';

import type { Plugin } from 'vite';

import { sliderEntries } from './entries.ts';
import { createViteImporter } from './importModule.ts';

export interface SliderPluginOptions extends RollupSliderPluginOptions {
  /**
   * Whether to turn `.deck.mdx` files into entry points with generated HTML
   * pages (see {@link sliderEntries}). Defaults to `true`.
   */
  entries?: boolean;
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
  ...options
}: SliderPluginOptions = {}): Plugin[] {
  let root = process.cwd();
  const mdx = rollupSlider({
    // Theme modules may be written in TypeScript and import style sheets.
    importModule: createViteImporter(() => root),
    ...options,
  }) as Plugin;
  const setRoot: Plugin = {
    name: 'slider:root',
    configResolved(config) {
      root = config.root;
    },
  };
  return entries ? [mdx, setRoot, sliderEntries()] : [mdx, setRoot];
}

export { sliderEntries };
