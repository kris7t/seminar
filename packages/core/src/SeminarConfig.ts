/**
 * Options of a Seminar plugin or theme that apply when compiling decks, since
 * they can't be changed at runtime.
 *
 * Plugin and theme packages provide them as either
 *
 * 1. a JSON file with the `seminar` export condition, e.g.,
 *    `"exports": { ".": { "seminar": "./seminar.json", "default": … } }`,
 *    which lets packages with several themes configure each of them, or
 * 2. the `seminar` key of their `package.json`, which is simpler for packages
 *    with a single theme.
 *
 * Other plugin and theme modules, like local files, export them as `seminar`.
 * Reading this export runs the module when compiling decks, outside of the
 * browser:
 *
 * - The module shouldn't access browser globals, like `window`, at the top
 *   level.
 * - With `@seminar/vite-plugin`, the module may be written in TypeScript, and
 *   its style sheets are ignored. However, the packages it imports are loaded
 *   by Node, without the aliases, resolve conditions, and plugins of Vite, so
 *   they must be built to JavaScript.
 * - With `@seminar/rollup-plugin` alone, the module is loaded by Node, so it
 *   can't import style sheets or use JSX.
 */
export interface SeminarConfig {
  /**
   * Other plugins that this plugin or theme uses, e.g.,
   * `['@seminar/plugin-shiki']`, which are loaded before it, so that it can
   * override their options. Relative paths are resolved from this config.
   */
  plugins?: readonly string[] | undefined;
  /**
   * Plugins of unified that compile MDX decks, see {@link MdxPluginsConfig}.
   */
  mdx?: MdxPluginsConfig | undefined;
  /**
   * Options of plugins by their name, e.g., `{ code: { theme: 'github-dark' } }`
   * for the `code` options of `@seminar/plugin-shiki`. Plugins, the theme, and the key
   * of the same name in the frontmatter of decks set them, in order of
   * increasing precedence. Plugins read them when compiling decks, with
   * `getSeminarOptions` of `@seminar/mdx`, and components read them in the
   * browser, with `useSeminarOptions`.
   */
  options?: Record<string, Record<string, unknown>> | undefined;
  /**
   * React components that render named Remark directives in MDX decks.
   * `source` is the module to import from and `exportName` is its named
   * component export.
   */
  directives?: Record<string, DirectiveComponentConfig> | undefined;
}

/**
 * How a Remark directive was written: `text` for `:name[…]` inline, `leaf`
 * for `::name[…]` on a line of its own, and `container` for `:::name` with
 * Markdown content up to the closing `:::`.
 */
export type DirectiveForm = 'text' | 'leaf' | 'container';

/** A named React component imported to render a Remark directive. */
export interface DirectiveComponentConfig {
  /** Module that exports the component. */
  source: string;
  /** Name of the component's export. */
  exportName: string;
  /**
   * Prop that receives the {@link DirectiveForm} of the directive, e.g.,
   * `directive`. Without it, the component isn't told the form.
   */
  formProp?: string | undefined;
  /**
   * Prop that receives the label of a container directive, `:::name[label]`,
   * as plain text. The content of a container directive is the children of
   * the component, while the label of text and leaf directives is. Without
   * it, the label is the first paragraph of the children.
   */
  labelProp?: string | undefined;
  /**
   * Directive to wrap consecutive leaf or container directives of this kind
   * in, unless they are directly in one already, e.g., `columns` for
   * `:::column`s, which then don't need a `::::columns` around them. The
   * wrapper has no attributes, so it's written explicitly to set them.
   */
  wrapIn?: string | undefined;
}

/** A named export of a module, e.g., a component or a function. */
export interface ModuleExportConfig {
  /** Module that exports it. */
  source: string;
  /** Name of the export. */
  exportName: string;
}

/**
 * Plugins of [unified](https://unifiedjs.com) that compile MDX decks, e.g.,
 * one that highlights code blocks, by the stage they run in: on the Markdown
 * syntax tree (remark), the HTML syntax tree (rehype), or the JavaScript
 * syntax tree (recma).
 *
 * The plugins of each stage run `before` or `after` the plugins of Seminar,
 * in the order of the configs. Remark plugins may extend the syntax of
 * Markdown, e.g., with math. The plugins are imported when compiling decks,
 * in Node, so they may use packages that decks shouldn't contain, but they
 * must be built to JavaScript. They take no options, but read those of
 * {@link SeminarConfig} with `getSeminarOptions` of `@seminar/mdx`.
 */
export interface MdxPluginsConfig {
  remarkPlugins?: MdxStagePluginsConfig | undefined;
  rehypePlugins?: MdxStagePluginsConfig | undefined;
  recmaPlugins?: MdxStagePluginsConfig | undefined;
}

/** Plugins of a stage of {@link MdxPluginsConfig}. */
export interface MdxStagePluginsConfig {
  /** Plugins that run before those of Seminar. */
  before?: readonly ModuleExportConfig[] | undefined;
  /** Plugins that run after those of Seminar. */
  after?: readonly ModuleExportConfig[] | undefined;
}
