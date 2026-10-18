/**
 * Options for rendering math when compiling decks written in MDX, where `$…$`
 * is inline math and `$$…$$` is display math. Write `\$` for a dollar sign.
 *
 * Math is rendered with MathJax at compile time, to SVG for display and to
 * MathML for assistive technology, so decks need no fonts or scripts to show
 * it. Some caveats:
 *
 * - `\eqref` only resolves labels defined earlier in the deck, and shows
 *   `(???)` for labels defined later.
 * - `\eqref` doesn't link to the equation, since that would navigate away from
 *   the slide.
 * - Each formula contains the glyphs it uses, which adds up for decks with a
 *   lot of math.
 *
 * Decks can override these options in the `math` key of their frontmatter.
 */
export interface MathConfig {
  /**
   * MathJax font to render math with, e.g., `fira` for the
   * `@mathjax/mathjax-fira-font` package, or the name of a MathJax font
   * package. Defaults to `newcm` (New Computer Modern), which is installed
   * with MathJax.
   *
   * The font package is resolved from the plugin, theme, or deck that sets the
   * font, so packages should depend on the package of their font.
   */
  font?: string | undefined;
  /**
   * TeX macros, e.g., `{ R: '\\mathbb{R}', norm: ['\\lVert #1 \\rVert', 1] }`.
   * Macros of plugins, the theme, and the frontmatter are merged in that
   * order.
   */
  macros?: Record<string, string | [string, number]> | undefined;
  /**
   * Which equations are numbered: `ams` numbers the environments that are
   * numbered in LaTeX with `amsmath`, like `equation` and `align`. Defaults to
   * `ams`.
   */
  tags?: 'none' | 'ams' | 'all' | undefined;
}

/**
 * Options of a Slider plugin or theme that apply when compiling decks, since
 * they can't be changed at runtime.
 *
 * Plugin and theme packages provide them as either
 *
 * 1. a JSON file with the `slider` export condition, e.g.,
 *    `"exports": { ".": { "slider": "./slider.json", "default": … } }`,
 *    which lets packages with several themes configure each of them, or
 * 2. the `slider` key of their `package.json`, which is simpler for packages
 *    with a single theme.
 *
 * Other plugin and theme modules, like local files, export them as `slider`.
 * Reading this export runs the module when compiling decks, outside of the
 * browser:
 *
 * - The module shouldn't access browser globals, like `window`, at the top
 *   level.
 * - With `@slider/vite-plugin`, the module may be written in TypeScript, and
 *   its style sheets are ignored. However, the packages it imports are loaded
 *   by Node, without the aliases, resolve conditions, and plugins of Vite, so
 *   they must be built to JavaScript.
 * - With `@slider/rollup-plugin` alone, the module is loaded by Node, so it
 *   can't import style sheets or use JSX.
 */
export interface SliderConfig {
  /**
   * Other plugins that this plugin or theme uses, e.g.,
   * `['@slider/plugin-shiki']`, which are loaded before it, so that it can
   * override their options. Relative paths are resolved from this config.
   */
  plugins?: readonly string[] | undefined;
  math?: MathConfig | undefined;
  /**
   * Plugins of unified that compile MDX decks, see {@link MdxPluginsConfig}.
   */
  mdx?: MdxPluginsConfig | undefined;
  /**
   * Options of plugins by their name, e.g., `{ code: { theme: 'github-dark' } }`
   * for the `code` options of `@slider/plugin-shiki`. Plugins, the theme, and the key
   * of the same name in the frontmatter of decks set them, in order of
   * increasing precedence. Plugins read them when compiling decks, with
   * `getSliderOptions` of `@slider/mdx`.
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
 * The plugins of each stage run `before` or `after` the plugins of Slider,
 * in the order of the configs. Remark plugins may extend the syntax of
 * Markdown, e.g., with math. The plugins are imported when compiling decks,
 * in Node, so they may use packages that decks shouldn't contain, but they
 * must be built to JavaScript. They take no options, but read those of
 * {@link SliderConfig} with `getSliderOptions` of `@slider/mdx`.
 */
export interface MdxPluginsConfig {
  remarkPlugins?: MdxStagePluginsConfig | undefined;
  rehypePlugins?: MdxStagePluginsConfig | undefined;
  recmaPlugins?: MdxStagePluginsConfig | undefined;
}

/** Plugins of a stage of {@link MdxPluginsConfig}. */
export interface MdxStagePluginsConfig {
  /** Plugins that run before those of Slider. */
  before?: readonly ModuleExportConfig[] | undefined;
  /** Plugins that run after those of Slider. */
  after?: readonly ModuleExportConfig[] | undefined;
}
