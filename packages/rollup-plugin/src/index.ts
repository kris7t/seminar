import path from 'node:path';

import mdx, { type Options as MdxOptions } from '@mdx-js/rollup';
import {
  importWithNode,
  loadSliderConfig,
  sliderMdxOptions,
  type LoadedSliderConfigEntry,
  type SliderMdxOptions,
} from '@slider/mdx';

/** A warning of compiling a deck. */
interface CompileWarning {
  message: string;
  line?: number;
  column?: number;
}

/** The parts of a compiled file of MDX that {@link slider} reads. */
interface CompiledFile {
  path: string;
  messages: readonly {
    reason: string;
    line?: number | null | undefined;
    column?: number | null | undefined;
  }[];
}

export interface SliderPluginOptions
  extends
    Omit<MdxOptions, 'include'>,
    Omit<SliderMdxOptions, 'defaultTheme' | 'onDependency' | 'sliderConfigs'> {
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
  /**
   * Slider plugins that extend MDX compilation through their config. Relative
   * paths are resolved against the root of the project.
   */
  plugins?: readonly string[] | undefined;
}

/** The plugin, which works with both Rollup and Vite. */
export type SliderPlugin = ReturnType<typeof mdx> & {
  enforce: 'pre';
  watchChange(id: string): void;
};

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
 *
 * Slider plugins can be listed in `plugins`. Their compile-time config is
 * read through the `slider` export condition or `slider` key in their
 * `package.json`. The deck's theme is merged after them, so it can replace
 * directive components registered by plugins.
 */
export default function slider({
  defaultTheme = '@slider/theme-default',
  defaultMouseNavigation = true,
  defaultMirrorPointer = false,
  include = /\.deck\.mdx$/,
  importSource,
  math,
  importModule,
  plugins = [],
  remarkPlugins = [],
  rehypePlugins = [],
  recmaPlugins = [],
  ...options
}: SliderPluginOptions = {}): SliderPlugin {
  // Files that decks depend on at compile time, e.g., the configs of their
  // themes, by the path of the deck.
  const dependencies = new Map<string, Set<string>>();
  const pluginDependencies = new Set<string>();
  // Warnings of compiling decks, by the path of the deck, which the MDX
  // plugin doesn't report.
  const warnings = new Map<string, CompileWarning[]>();
  const collectWarnings = () => (_tree: unknown, file: CompiledFile) => {
    warnings.set(
      file.path,
      file.messages.map(({ reason, line, column }) => ({
        message: reason,
        ...(line === undefined || line === null ? {} : { line }),
        ...(column === undefined || column === null ? {} : { column }),
      })),
    );
  };
  const createMdx = async (root: string) => {
    const sliderConfigs: LoadedSliderConfigEntry[] = [];
    const importer = importModule ?? importWithNode;
    const importerPath = path.join(root, 'deck.mdx');
    for (const source of plugins) {
      const loaded = await loadSliderConfig(source, importerPath, importer);
      sliderConfigs.push({ source, ...loaded });
      for (const dependency of loaded.dependencies) {
        pluginDependencies.add(dependency);
      }
    }
    const sliderOptions = sliderMdxOptions({
      importSource,
      defaultTheme:
        defaultTheme === false
          ? undefined
          : defaultTheme.startsWith('.')
            ? path.resolve(root, defaultTheme)
            : defaultTheme,
      defaultMouseNavigation,
      defaultMirrorPointer,
      math,
      importModule,
      sliderConfigs,
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
      remarkRehypeOptions: {
        ...options.remarkRehypeOptions,
        handlers: {
          ...sliderOptions.remarkRehypeOptions?.handlers,
          ...options.remarkRehypeOptions?.handlers,
        },
      },
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
        // Last, to see the warnings of all the other plugins.
        collectWarnings,
      ],
    });
  };

  // Relative paths are resolved against the root of the project, which Vite
  // only tells us in the `config` hook. Rollup doesn't call it, so we fall
  // back to the working directory there.
  let rootPath = process.cwd();
  let inner: ReturnType<typeof mdx> | undefined;
  let pendingInner: Promise<ReturnType<typeof mdx>> | undefined;
  let configured:
    | {
        config: Parameters<SliderPlugin['config']>[0];
        env: Parameters<SliderPlugin['config']>[1];
      }
    | undefined;
  const getInner = async (root: string): Promise<ReturnType<typeof mdx>> => {
    if (inner !== undefined) {
      return inner;
    }
    pendingInner ??= createMdx(root);
    inner = await pendingInner;
    if (configured !== undefined) {
      inner.config(configured.config, configured.env);
    }
    return inner;
  };
  const plugin: SliderPlugin = {
    name: 'slider',
    // Vite has to compile the MDX before transforming the resulting JSX.
    enforce: 'pre',
    config(config, env) {
      const { root } = config as { root?: string };
      configured = { config, env };
      rootPath = path.resolve(root ?? process.cwd());
    },
    // `this` is the plugin context of Rollup or Vite.
    async transform(
      this: {
        addWatchFile(id: string): void;
        warn(warning: {
          message: string;
          loc?: { file: string; line: number; column: number };
        }): void;
      },
      value: string,
      id: string,
    ) {
      const mdxPlugin = await getInner(rootPath);
      dependencies.delete(id);
      warnings.delete(id);
      const result = await mdxPlugin.transform(value, id);
      for (const { message, line, column } of warnings.get(id) ?? []) {
        this.warn({
          message,
          ...(line === undefined
            ? {}
            : { loc: { file: id, line, column: column ?? 1 } }),
        });
      }
      for (const dependency of pluginDependencies) {
        this.addWatchFile(dependency);
      }
      for (const dependency of dependencies.get(id) ?? []) {
        this.addWatchFile(dependency);
      }
      return result;
    },
    watchChange(id) {
      if (pluginDependencies.has(id)) {
        inner = undefined;
        pendingInner = undefined;
        pluginDependencies.clear();
      }
    },
  };
  return plugin;
}
