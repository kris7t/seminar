# Callouts

A callout is a speech bubble pointing at something on the slide, e.g., to
explain a word or a part of a figure. It floats over the slide, taking no
room, and appears as a step.

## In the text

`:callout[…]` in the text points at its own position:

```mdx
Parsing builds a syntax tree:callout[Also known as an AST] of the slide.
```

## Pointing at an element

On a line of its own, `::callout` points at a [named element](../core/content.md#naming-elements)
with `for`:

```mdx
![Architecture](./architecture.svg){#arch}

::callout[The parser]{for=arch at=30%,40%}
```

`at=x,y` chooses a point in the box of the element, in logical slide pixels,
like `120,80`, or in percentages of its size, like `30%,40%`. Without it, the
callout points at the middle of the top or bottom edge of the element.
Without `for`, `at` is a point on the slide, defaulting to its middle.

## With Markdown content

`:::callout` holds Markdown, like paragraphs and lists, up to the closing
`:::`. Its label is a centered title, and its text is left-aligned:

```mdx
:::callout[Why a tree?]{for=arch}
Trees are easy to transform.

- Plugins see the whole slide
- Steps nest like the tree
  :::
```

## Steps

A callout is a step of its own, with the `scoped` behavior: it stays until
the step it belongs to is past.

A callout with `for` belongs to the step of the element it points at, e.g.,
an image with `{#arch step}`, or the step around the element, and appears in
a step nested in it. Likewise, a callout in the text appears in a step nested
in the step of its text. As usual,
`in=…` nests it in another group, `with=…` or `group=…` places it otherwise,
and a behavior like `only` shows it only during its step.

```mdx
- :step{group=parse} Parsing turns Markdown into a syntax tree
- :step{group=render} Rendering turns the tree into React elements

A callout:callout[Belongs to parsing]{in=parse} disappears before rendering.
```

## Size and look

Callouts fit their text, up to a width of 360 pixels.

| Attribute    | Meaning                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `width`      | Width of the bubble, instead of fitting the text                                        |
| `maxWidth`   | Width at which the text breaks into lines, instead of 360                               |
| `align`      | Alignment of the text, e.g., `left`, defaulting to `center`, or `left` for `:::callout` |
| `color`      | A color of the theme, like `primary` or `secondary`, or of text, like `text.secondary`  |
| `variant`    | `filled`, the default, or `outlined`                                                    |
| `elevation`  | Shadow depth from 0 to 24, like MUI's `Paper`, defaulting to 4                          |
| `angle`      | Direction of the stem from the bubble, in degrees, e.g., `90` for downwards             |
| `offset`     | Length of the stem                                                                      |
| `stemOffset` | Where the stem leaves its edge, from 0 to 1                                             |
| `shift`      | Moves the point the stem points at, e.g., `0,-8`                                        |

Without `angle`, the callout grows toward the top right, with its stem pointing
down and left. It flips horizontally or vertically when needed to keep its
body within a 24-pixel margin of the slide.

Themes can set the defaults of these and add variants as `SliderCallout`, and
style the titles as `SliderCalloutTitle`.
