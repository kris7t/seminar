# Math

`@seminar/plugin-mathjax` typesets math with [MathJax](https://www.mathjax.org).

Math is typeset when the deck is compiled. The deck contains the result as
SVG, with MathML for screen readers. It needs no scripts or fonts to show
it.

For math that changes while you present, see [Dynamic math](dynamic.md).

## Enabling the plugin

Add `@seminar/plugin-mathjax` to the dependencies of your project. Then list
it in the plugins in `vite.config.ts`:

```ts
seminar({ plugins: ['@seminar/plugin-mathjax'] });
```

Without the plugin, dollar signs are ordinary text.

## Writing math

Write inline math between `$` signs, and display math between `$$` lines, in
TeX:

```mdx
Euler's identity, $e^{i\pi} + 1 = 0$, in display:

$$
\begin{equation}
  e^{i\pi} + 1 = 0 \label{euler}
\end{equation}
$$

As $\eqref{euler}$ shows, …
```

Write `\$` for a dollar sign.

Equations in environments like `equation` and `align` are numbered.
`\eqref` refers to equations earlier in the deck. It doesn't link to them,
since that would leave the slide.

TeX errors, like undefined macros, are shown in red. You also get a warning
for them.

## Options

Set the options for a deck in the `math` key of its frontmatter:

```yaml
math:
  font: newcm
  macros:
    R: '\mathbb{R}'
    norm: ['\lVert #1 \rVert', 1]
  tags: ams
```

- `font` is a MathJax font. The default is `fira`, which goes well with
  sans-serif text. `newcm` is New Computer Modern, the font of LaTeX.
- `macros` are TeX macros. A macro with arguments is a pair of its
  definition and the number of its arguments.
- `tags` says which equations are numbered: `ams` (the default), `all`, or
  `none`.
- `dynamic` lets the deck show [dynamic math](dynamic.md).

To set options for every deck, set them in the config of your presentation
theme:

```ts
export const seminar: SeminarConfig = {
  options: { math: { macros: { R: '\\mathbb{R}' } } },
};
```

The frontmatter wins over the presentation theme. Macros are merged.

### Other fonts

Fonts other than `fira` and `newcm` are packages, like
`@mathjax/mathjax-stix2-font` for `stix2`. Add the package to your
dependencies to use it.

## Styling formulas

Formulas are `Formula` components. Style them as `SeminarFormula` in the MUI
theme of your slides.
