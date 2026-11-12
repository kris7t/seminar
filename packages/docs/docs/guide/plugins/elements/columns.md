---
sidebar_position: 3
slug: /guide/elements/columns
---

# Columns

Consecutive `:::column` containers are laid out side by side:

```mdx
:::column[Before]
The slide as written.
:::

:::column[After]
The slide as shown.
:::
```

The label of a column is its title, shown centered above it.

## Sizes

Columns share the width of the slide equally. `grow` gives a column a
larger share, and `width` a fixed width, in logical slide pixels or any CSS
length:

```mdx
:::column{grow=2}
Twice as wide as the next one
:::

:::column
Narrow
:::

:::column{width=300}
Exactly 300 pixels wide
:::
```

`headingVariant` sets the typography of the title, e.g., `h4`, instead of
`h5`.

## Look

| Attribute   | Meaning                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| `color`     | A color of the theme, like `primary`, the default, or of text, like `text.secondary` |
| `variant`   | `plain`, the default, with its title in the color, or `card`, see below              |
| `elevation` | Shadow depth from 0, the default, to 24, like MUI's `Paper`                          |
| `radius`    | Corner radius, defaulting to twice the radius of the theme                           |

Set on `::::columns`, they apply to all of its columns, unless a column sets
them itself:

```mdx
::::columns{variant=card}
:::column[Input]
Text of the slides
:::

:::column[Output]{color=secondary elevation=4}
Slides with shadows
:::
::::
```

Cards show their title on a band of their color, over a faint background of
it. Plain columns with an elevation get a background and padding, so that
they cast their shadow like a card.

Themes can set the defaults of these and add variants as `SeminarColumn`, and
set the defaults of rows as `SeminarColumns`. The defaults of columns override
those of rows, but what a row sets in the deck overrides both.

## Spacing and alignment

The columns are wrapped in a `::::columns` container automatically. Write it
explicitly to set the space between the columns with `gap`, or how they're
aligned vertically with `align`: `stretch` (the default), `start`, `center`,
or `end`. Stretched columns are as high as the row, e.g., cards of the same
height, with their content at their tops. It needs more colons than the
columns inside it:

```mdx
::::columns{gap=80 align=center}
:::column
Left
:::

:::column
Right
:::
::::
```

## Steps

Like paragraphs, columns are shown with the step before them. `step` reveals
a column in a step of its own, and its content can have nested steps:

```mdx
:::column[First]
Shown up front
:::

:::column[Second]{step}
Revealed in a step

- :step with nested steps
- :step like this one
  :::
```
