import path from 'node:path';

import mdx, { type Options as MdxOptions } from '@mdx-js/rollup';
import { sliderMdxOptions, type SliderMdxOptions } from '@slider/mdx';

export interface SliderPluginOptions
  extends
    Omit<MdxOptions, 'include'>,
    Omit<SliderMdxOptions, 'defaultTheme' | 'onDependency'> {
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
 * entry points with generated HTML pages, and can read the compile-time config
 * of themes written in TypeScript.
 *
 * Math is rendered at compile time with the options of the theme of the deck
 * (see `SliderConfig` in `@slider/core`). Without Vite, theme modules that
 * aren't packages with a compile-time config are imported by Node to read
 * their config, so they can't import style sheets or use JSX. The files of the
 * config are watched for changes.
 *
 * Additional MDX plugins can be passed in the options. Remark plugins run
 * after the slides have been created, rehype plugins run after list items have
 * been turned into steps, and recma plugins run after the slide titles have
 * been resolved.
 */
export default function slider({
  defaultTheme = '@slider/theme-default',
  defaultMouseNavigation = true,
  include = /\.deck\.mdx$/,
  importSource,
  math,
  importModule,
  remarkPlugins = [],
  rehypePlugins = [],
  recmaPlugins = [],
  ...options
}: SliderPluginOptions = {}): SliderPlugin {
  // Files that decks depend on at compile time, e.g., the configs of their
  // themes, by the path of the deck.
  const dependencies = new Map<string, Set<string>>();
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
      math,
      importModule,
      onDependency(deckPath, dependency) {
        let deckDependencies = dependencies.get(deckPath);
        if (deckDependencies === undefined) {
          deckDependencies = new Set();
          dependencies.set(deckPath, deckDependencies);
        }
        deckDependencies.add(dependency);
      },
    });
    return mdx({
      ...options,
      include,
      remarkPlugins: [
        ...(sliderOptions.remarkPlugins ?? []),
        ...(remarkPlugins ?? []),
      ],
      rehypePlugins: [
        ...(sliderOptions.rehypePlugins ?? []),
        ...(rehypePlugins ?? []),
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
    // `this` is the plugin context of Rollup or Vite.
    async transform(
      this: { addWatchFile(id: string): void },
      value: string,
      id: string,
    ) {
      inner ??= createMdx(process.cwd());
      dependencies.delete(id);
      const result = await inner.transform(value, id);
      for (const dependency of dependencies.get(id) ?? []) {
        this.addWatchFile(dependency);
      }
      return result;
    },
  };
  return plugin;
}
