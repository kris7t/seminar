import mdx, { type Options as MdxOptions } from '@mdx-js/rollup';
import { sliderMdxOptions, type RemarkSlidesOptions } from '@slider/mdx';

export interface SliderPluginOptions
  extends Omit<MdxOptions, 'include'>, RemarkSlidesOptions {
  /**
   * Files to compile as decks. Defaults to files ending in `.deck.mdx`.
   */
  include?: MdxOptions['include'];
}

/** A plugin that works with both Rollup and Vite. */
export type SliderPlugin = ReturnType<typeof mdx> & { enforce: 'pre' };

/**
 * Compiles `.deck.mdx` files into `Deck` components with MDX (see
 * `remarkSlides` in `@slider/mdx`).
 *
 * Additional MDX plugins can be passed in the options. Remark plugins run
 * after the slides have been created, and recma plugins run after the slide
 * titles have been resolved.
 */
export default function slider({
  include = /\.deck\.mdx$/,
  importSource,
  remarkPlugins = [],
  recmaPlugins = [],
  ...options
}: SliderPluginOptions = {}): SliderPlugin {
  const sliderOptions = sliderMdxOptions(
    importSource === undefined ? {} : { importSource },
  );
  return {
    ...mdx({
      ...options,
      include,
      remarkPlugins: [
        ...(sliderOptions.remarkPlugins ?? []),
        ...(remarkPlugins ?? []),
      ],
      recmaPlugins: [
        ...(sliderOptions.recmaPlugins ?? []),
        ...(recmaPlugins ?? []),
      ],
    }),
    name: 'slider',
    // Vite has to compile the MDX before transforming the resulting JSX.
    enforce: 'pre',
  };
}
