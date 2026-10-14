import rollupSlider, {
  type SliderPluginOptions as RollupSliderPluginOptions,
} from '@slider/rollup-plugin';
import type { Plugin } from 'vite';

import { sliderEntries } from './entries.ts';

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
 */
export default function slider({
  entries = true,
  ...options
}: SliderPluginOptions = {}): Plugin[] {
  const mdx = rollupSlider(options) as Plugin;
  return entries ? [mdx, sliderEntries()] : [mdx];
}

export { sliderEntries };
