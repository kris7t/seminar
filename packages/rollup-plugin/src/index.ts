import path from 'node:path';

import mdx, { type Options as MdxOptions } from '@mdx-js/rollup';
import { createFilter } from '@rollup/pluginutils';
import {
  loadDeckSetup,
  readDeckTheme,
  resolveThemeKey,
  seminarMdxOptions,
  type DeckSetup,
  type ModuleImporter,
  type ModuleResolver,
  type SeminarMdxOptions,
} from '@seminar/mdx';
import type { PluggableList } from 'unified';

/** A warning of compiling a deck. */
interface CompileWarning {
  message: string;
  line?: number;
  column?: number;
}

/** The parts of a compiled file of MDX that {@link seminar} reads. */
interface CompiledFile {
  path: string;
  messages: readonly {
    reason: string;
    line?: number | null | undefined;
    column?: number | null | undefined;
  }[];
}

export interface SeminarPluginOptions
  extends
    Omit<MdxOptions, 'include'>,
    Omit<
      SeminarMdxOptions,
      'defaultTheme' | 'onDependency' | 'seminarConfigs'
    > {
  /**
   * Module to import the theme of decks from, unless they set their own
   * `theme` in the frontmatter. Relative paths, like `./src/theme.ts`, are
   * resolved against the root of the project. Defaults to
   * `@seminar/theme-default`. Set to `false` to use the built-in theme of
   * `@seminar/core`, which doesn't load any fonts.
   */
  defaultTheme?: string | false;
  /**
   * Imports the modules of plugins and themes at compile time, e.g., to read
   * their `seminar` export. Defaults to importing with Node.
   */
  importModule?: ModuleImporter | undefined;
  /** Resolves integration-specific aliases for themes and plugins. */
  resolveModule?: ModuleResolver | undefined;
  /**
   * Files to compile as decks. Defaults to files ending in `.deck.mdx`.
   */
  include?: MdxOptions['include'];
  /**
   * Seminar plugins that extend MDX compilation through their config. Relative
   * paths are resolved against the root of the project.
   */
  plugins?: readonly string[] | undefined;
}

/** The plugin, which works with both Rollup and Vite. */
export type SeminarPlugin = ReturnType<typeof mdx> & {
  enforce: 'pre';
  watchChange(id: string): Promise<void>;
  /**
   * Returns the remark plugins that extend the syntax of the deck at
   * `deckPath` with `source`, e.g., to parse it without compiling it.
   */
  syntaxPlugins(source: string, deckPath: string): Promise<PluggableList>;
};

/** Compiles the decks of a theme. */
interface Compiler {
  mdx: ReturnType<typeof mdx>;
  setup: DeckSetup;
}

/**
 * Compiles `.deck.mdx` files into `Deck` components with MDX (see
 * `remarkSlides` in `@seminar/mdx`).
 *
 * In Vite, use `@seminar/vite-plugin` instead, which also turns decks into
 * entry points with generated HTML pages, and can read the compile-time config
 * of themes written in TypeScript.
 *
 * Math is rendered at compile time with the options of the theme of the deck
 * (see `SeminarConfig` in `@seminar/core`). Without Vite, theme modules that
 * aren't packages with a compile-time config are imported by Node to read
 * their config, so they can't import style sheets or use JSX. The files of the
 * config are watched for changes.
 *
 * Additional MDX plugins can be passed in the options. Remark plugins run
 * after the slides have been created, rehype plugins run after list items have
 * been turned into steps, and recma plugins run after the slide titles have
 * been resolved.
 *
 * Seminar plugins can be listed in `plugins`. Their compile-time config is
 * read through the `seminar` export condition or `seminar` key in their
 * `package.json`. The deck's theme is merged after them, so it can replace
 * directive components registered by plugins.
 */
export default function seminar({
  defaultTheme = '@seminar/theme-default',
  defaultMouseNavigation = true,
  defaultMirrorPointer = false,
  include = /\.deck\.mdx$/,
  importSource,
  importModule,
  resolveModule,
  plugins = [],
  remarkPlugins = [],
  rehypePlugins = [],
  recmaPlugins = [],
  ...options
}: SeminarPluginOptions = {}): SeminarPlugin {
  // Files that decks depend on at compile time, e.g., the configs of their
  // themes, by the path of the deck.
  const dependencies = new Map<string, Set<string>>();
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
  const isDeck = createFilter(include);
  /** Compiles decks with the theme `theme`, or without one. */
  const createCompiler = async (
    root: string,
    theme: string | undefined,
    deckPath: string,
  ): Promise<Compiler> => {
    const setup = await loadDeckSetup({
      plugins,
      theme,
      pluginsImporter: path.join(root, 'deck.mdx'),
      themeImporter: deckPath,
      importModule,
      resolveModule,
    });
    const seminarOptions = seminarMdxOptions({
      importSource,
      defaultTheme: resolvedDefaultTheme(root),
      defaultMouseNavigation,
      defaultMirrorPointer,
      seminarConfigs: setup.seminarConfigs,
      mdxPlugins: setup.mdxPlugins,
      onDependency(path, dependency) {
        let deckDependencies = dependencies.get(path);
        if (deckDependencies === undefined) {
          deckDependencies = new Set();
          dependencies.set(path, deckDependencies);
        }
        deckDependencies.add(dependency);
      },
    });
    const compiler = mdx({
      ...options,
      include,
      remarkRehypeOptions: {
        ...options.remarkRehypeOptions,
        handlers: {
          ...seminarOptions.remarkRehypeOptions?.handlers,
          ...options.remarkRehypeOptions?.handlers,
        },
      },
      remarkPlugins: [
        ...(seminarOptions.remarkPlugins ?? []),
        ...(remarkPlugins ?? []),
      ],
      rehypePlugins: [
        ...(seminarOptions.rehypePlugins ?? []),
        ...(rehypePlugins ?? []),
      ],
      recmaPlugins: [
        ...(seminarOptions.recmaPlugins ?? []),
        ...(recmaPlugins ?? []),
        // Last, to see the warnings of all the other plugins.
        collectWarnings,
      ],
    });
    if (configured !== undefined) {
      compiler.config(configured.config, configured.env);
    }
    return { mdx: compiler, setup };
  };

  // Relative paths are resolved against the root of the project, which Vite
  // only tells us in the `config` hook. Rollup doesn't call it, so we fall
  // back to the working directory there.
  let rootPath = process.cwd();
  const resolvedDefaultTheme = (root: string): string | undefined =>
    defaultTheme === false
      ? undefined
      : defaultTheme.startsWith('.')
        ? path.resolve(root, defaultTheme)
        : defaultTheme;
  let configured:
    | {
        config: Parameters<SeminarPlugin['config']>[0];
        env: Parameters<SeminarPlugin['config']>[1];
      }
    | undefined;
  // Compilers by the theme of the decks they compile, since the theme and
  // the plugins it refers to may extend the compiler.
  const compilers = new Map<string, Promise<Compiler>>();
  /** Returns the compiler of the deck at `deckPath` with `source`. */
  const getCompiler = (source: string, deckPath: string): Promise<Compiler> => {
    const theme = readDeckTheme(source) ?? resolvedDefaultTheme(rootPath);
    const key = theme === undefined ? '' : resolveThemeKey(theme, deckPath);
    let compiler = compilers.get(key);
    if (compiler === undefined) {
      compiler = createCompiler(rootPath, theme, deckPath);
      compilers.set(key, compiler);
    }
    return compiler;
  };
  const plugin: SeminarPlugin = {
    name: 'seminar',
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
      if (!isDeck(id)) {
        return undefined;
      }
      const { mdx: compiler, setup } = await getCompiler(value, id);
      dependencies.delete(id);
      warnings.delete(id);
      const result = await compiler.transform(value, id);
      for (const message of setup.warnings) {
        this.warn({ message });
      }
      for (const { message, line, column } of warnings.get(id) ?? []) {
        this.warn({
          message,
          ...(line === undefined
            ? {}
            : { loc: { file: id, line, column: column ?? 1 } }),
        });
      }
      for (const dependency of [
        ...setup.dependencies,
        ...(dependencies.get(id) ?? []),
      ]) {
        this.addWatchFile(dependency);
      }
      return result;
    },
    async watchChange(id) {
      for (const [key, compiler] of compilers) {
        if ((await compiler).setup.dependencies.includes(id)) {
          compilers.delete(key);
        }
      }
    },
    /** Returns the plugins that extend the syntax of the deck. */
    async syntaxPlugins(source: string, deckPath: string) {
      return (await getCompiler(source, deckPath)).setup.mdxPlugins
        .remarkPlugins.before;
    },
  };
  return plugin;
}
