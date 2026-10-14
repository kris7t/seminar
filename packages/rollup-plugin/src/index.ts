import path from 'node:path';

import mdx, { type Options as MdxOptions } from '@mdx-js/rollup';
import { sliderMdxOptions, type RemarkSlidesOptions } from '@slider/mdx';

export interface SliderPluginOptions
  extends
    Omit<MdxOptions, 'include'>,
    Omit<RemarkSlidesOptions, 'defaultTheme'> {
  /**
   * Module to import the theme of decks from, unless they set their own
   * `theme` in the frontmatter. Relative paths, like `./src/theme.ts`, are
   * resolved against the root of the project. Defaults to
   * `@slider/theme-default`. Set to `false` to use the built-in theme of
   * `@slider/core`, which doesn't load any fonts.
   */
  defaultTheme?: string | false;
  /**
   * Files to compile as decks. Defaults to files ending in `.deck.mdx`.
   */
  include?: MdxOptions['include'];
}

/** The plugin, which works with both Rollup and Vite. */
export type SliderPlugin = ReturnType<typeof mdx> & { enforce: 'pre' };

/**
 * Compiles `.deck.mdx` files into `Deck` components with MDX (see
 * `remarkSlides` in `@slider/mdx`).
 *
 * In Vite, use `@slider/vite-plugin` instead, which also turns decks into
 * entry points with generated HTML pages.
 *
 * Additional MDX plugins can be passed in the options. Remark plugins run
 * after the slides have been created, and recma plugins run after the slide
 * titles have been resolved.
 */
export default function slider({
  defaultTheme = '@slider/theme-default',
  defaultMouseNavigation = true,
  include = /\.deck\.mdx$/,
  importSource,
  remarkPlugins = [],
  recmaPlugins = [],
  ...options
}: SliderPluginOptions = {}): SliderPlugin {
  const createMdx = (root: string) => {
    const sliderOptions = sliderMdxOptions({
      importSource,
      defaultTheme:
        defaultTheme === false
          ? undefined
          : defaultTheme.startsWith('.')
            ? path.resolve(root, defaultTheme)
            : defaultTheme,
      defaultMouseNavigation,
    });
    return mdx({
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
    });
  };

  // Relative paths are resolved against the root of the project, which Vite
  // only tells us in the `config` hook. Rollup doesn't call it, so we fall
  // back to the working directory there.
  let inner: ReturnType<typeof mdx> | undefined;
  const plugin: SliderPlugin = {
    name: 'slider',
    // Vite has to compile the MDX before transforming the resulting JSX.
    enforce: 'pre',
    config(config, env) {
      const { root } = config as { root?: string };
      inner = createMdx(path.resolve(root ?? process.cwd()));
      inner.config(config, env);
    },
    transform(value, id) {
      inner ??= createMdx(process.cwd());
      return inner.transform(value, id);
    },
  };
  return plugin;
}
