# Dynamic math

`DynamicFormula` typesets math in the browser. Use it in components for math
that changes while you present, like a formula that the audience types:

```tsx
import { DynamicFormula } from '@seminar/plugin-mathjax/dynamic';

<DynamicFormula tex={tex} display />;
```

Enable it in the options of the deck:

```yaml
math:
  dynamic: true
```

Dynamic formulas use the font, the macros, and the `tags` of the deck, see
[Options](README.md#options).

Only decks that enable `dynamic` contain MathJax. The formula is empty until
its first result is ready. When `tex` changes, the previous formula stays
until the new one is ready.

Changes of the slide wait up to a second for dynamic formulas to render, so
the slide doesn't shift when they appear. So do updates made with
`useSlideUpdate`, e.g., to show a formula when a button is clicked. See
[Updating the slide](../authoring/components.md#updating-the-slide).

In other decks, `DynamicFormula` shows its TeX in red.

## Glyphs

Fonts load most of their glyphs only when a formula needs them. The glyphs
are in files like `latin`, `greek`, or `arrows`, in the `mjs/svg/dynamic`
directory of the font package.

Self-contained builds can't load files later, so they contain all of the
glyphs. With MathJax, that adds about 5 MB. To keep only some of the files,
list them in `glyphs`:

```yaml
math:
  dynamic:
    glyphs: [double-struck, fraktur]
```

Glyphs in other files show as missing.

## Props

- `tex` is the formula in TeX.
- `display` shows the formula on its own line, like `$$`.
- `macros` are TeX macros in addition to those of the deck.
- `tags` overrides the `tags` of the deck. Each formula is numbered on its
  own.
- `onError` is called with errors, like those of TeX. TeX errors are also
  shown in red.

Style it as `SeminarFormula`, like other formulas.
