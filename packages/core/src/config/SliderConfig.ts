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
   * The font package is resolved from the theme (or the deck, if the deck sets
   * the font), so themes should depend on the package of their font.
   */
  font?: string | undefined;
  /**
   * TeX macros, e.g., `{ R: '\\mathbb{R}', norm: ['\\lVert #1 \\rVert', 1] }`.
   * Macros of the frontmatter are added to those of the theme.
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
 * Options of a theme that apply when compiling decks, since they can't be
 * changed at runtime.
 *
 * Theme packages provide them as either
 *
 * 1. a JSON file with the `slider` export condition, e.g.,
 *    `"exports": { ".": { "slider": "./slider.json", "default": … } }`,
 *    which lets packages with several themes configure each of them, or
 * 2. the `slider` key of their `package.json`, which is simpler for packages
 *    with a single theme.
 *
 * Other theme modules, like local files, export them as `slider`. Reading this
 * export runs the theme module when compiling decks, outside of the browser:
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
  math?: MathConfig | undefined;
}
