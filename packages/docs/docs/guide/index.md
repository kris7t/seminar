---
sidebar_position: 1
sidebar_label: Overview
---

# User guide

Write and present Seminar decks in MDX: Markdown with directives,
attributes, and React components. Set up a project, preview it as you edit,
and present it with notes, slide previews, and navigation controls.

To build your own components, plugins, or themes, see
[Developers](../developer/index.md).

> Seminar is a proof of concept, so the syntax may still change.

## Getting started

1. [Vite setup](vite.md): run the example, configure plugins, and build a
   presentation to share.
2. [Editing and live preview](editing.md): work in your editor or with a
   coding agent while the deck updates in the browser.

## Core

What every deck can use, provided by `@seminar/core` and `@seminar/mdx`:

1. [Decks and slides](core/decks.md): the deck file, its frontmatter, and how
   headings turn into slides.
2. [Content](core/content.md): lists, paragraphs, images, math, code, notes,
   and React components on slides, and naming elements on a slide.
3. [Steps](core/steps.md): revealing content step by step, and how steps look
   before and after their turn.
4. [Recaps and includes](core/reuse.md): showing a slide again, and reusing
   slides of other decks.

## Presenting

[Presentation controls](presenting.md) cover navigation with the keyboard,
mouse, and touch; the overview and table of contents; presenter notes,
previews, timers, and pointer mirroring.

## Elements

Presentation elements from the `@seminar/elements` plugin:

1. [Using elements](elements/index.md): enabling the plugin.
2. [Callouts](elements/callouts.md): speech bubbles pointing at text, images,
   or other elements.
3. [Columns](elements/columns.md): content side by side.

## Plugins

1. [Math](mathjax/index.md) with `@seminar/plugin-mathjax`: writing math,
   fonts, and macros.
   - [Dynamic math](mathjax/dynamic.md): math that changes while you
     present.
2. [Highlighting code](shiki/index.md) with `@seminar/plugin-shiki`: themes,
   and other languages.

## Syntax at a glance

Besides Markdown and MDX, decks use [directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444)
in three forms:

| Form      | Written as                           | Used for                        |
| --------- | ------------------------------------ | ------------------------------- |
| Text      | `:name[label]{attributes}`           | Something within a line of text |
| Leaf      | `::name[label]{attributes}`          | Something on a line of its own  |
| Container | `:::name[label]{attributes}` … `:::` | A block holding Markdown        |

The label and the attributes are optional. Attributes are written like in
Pandoc:

- `#intro` sets the id, or name, to `intro`,
- `.wide` adds the class `wide`,
- `width=600` or `title="Two words"` sets a value, and
- a bare word, like `only`, sets a flag.

Headings and images take the same attributes in braces right after them,
e.g., `## Intro {#intro}` or `![Tree](./tree.svg){width=600}`.

Containers nest by using more colons for the outer one:

```mdx
::::columns
:::column
Left
:::

:::column
Right
:::
::::
```

Write `\:step` for a literal `:step`, and `\{` for a brace that isn't an MDX
expression.
