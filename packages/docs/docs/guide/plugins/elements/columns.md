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

## Spacing and alignment

The columns are wrapped in a `::::columns` container automatically. Write it
explicitly to set the space between the columns with `gap`, or how they're
aligned vertically with `align`: `start` (the default), `center`, `end`, or
`stretch`. It needs more colons than the columns inside it:

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
