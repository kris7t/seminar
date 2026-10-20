# Content

Slides hold ordinary Markdown: paragraphs, lists, emphasis, links, code, and
tables. This page covers what Seminar adds to it.

## Images

Images next to the deck are bundled with it, and inlined into self-contained
builds:

```mdx
![The architecture of the compiler](./architecture.svg)
```

Paths are resolved relative to the deck, even when its slides are included
in another deck. Addresses like `https://…` or `/logo.svg` are left as they
are.

An image on a line of its own is a block, centered on the slide. An image
within a line of text stays in the text, e.g., an icon.

### Alt text and captions

The alt text, in the brackets, says what the image shows, for people who
can't see it. The title, in quotes, is the caption of a block image, shown
below it:

```mdx
![A tree with Markdown nodes](./tree.svg 'The syntax tree of a slide')
```

A caption already describes the image to everyone, so the alt text can be
left out, or say what the caption doesn't. Without either, the image is
decorative, and screen readers skip it. The title of an image in the text is
its tooltip.

### Attributes

Attributes in braces right after an image set its name, classes, size, and
steps:

```mdx
![Architecture](./architecture.svg){#arch .framed width=600 step}
```

- `#arch` names the image on the slide, e.g., for callouts to point at it.
- `width` and `height` are in logical slide pixels, which scale with the
  slide.
- `step` and the other attributes of `:step` reveal the image, see
  [Steps](steps.md).

Reference-style images, like `![Architecture][arch]{width=600}`, take
attributes the same way.

## Math

Math is written in TeX between dollar signs, like `$e^{i\pi}$`. It's
typeset by a plugin, like [`@seminar/plugin-mathjax`](../mathjax/README.md).
Without one, dollar signs are ordinary text.

## Code

Code blocks are fenced with three backticks, with their language after the
opening fence:

````mdx
```ts
export const answer = 42;
```
````

They're shown as plain text, unless a plugin highlights them, like
[`@seminar/plugin-shiki`](../shiki/README.md).

## Presenter notes

A `:::notes` container holds notes for the presenter, shown below the slide
in the presenter view, but not to the audience:

```mdx
:::notes
Mention that the deck is a single HTML file.
:::
```

Notes can contain any Markdown.

## React components

A deck can import React components and use them like HTML elements:

```mdx
import { Calculator } from './src/Calculator.tsx';

### Try it

<Calculator />
```

Components can keep their state with `useSlideState` from `@seminar/core`,
which shares it between every view of the slide, e.g., the presenter view and
the audience window, so that interactive slides work in front of the
audience.

## Naming elements

An id on an element names it on its slide, e.g., for a callout to point at,
or a step to nest in:

```mdx
Parsing <span id="tree">builds a tree</span> of the slide.

![Architecture](./architecture.svg){#arch}

:step{#parse} Parsing turns Markdown into a syntax tree.
```

Names belong to a slide, rather than the page: the same slide can be shown
several times at once, e.g., in the overview and the presenter view, or again
in a recap, without clashes. Two elements with the same name on a slide get a
warning.

Inline SVG can refer to its own parts by name as usual, e.g.,
`fill="url(#gradient)"`, `href="#icon"`, or `aria-labelledby="caption"`, and
the references follow the names.
