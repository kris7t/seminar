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

1. [Getting started](getting-started.md): create a project, edit your slides,
   and build a presentation to share.
2. [Editing and live preview](editing.md): work in your editor or with a
   coding agent while the deck updates in the browser.

## Writing decks

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

## Plugins

[Plugins](plugins/index.mdx) extend Seminar with additional slide components,
syntax, and compiler features. You can also
[develop your own](../developer/plugins.md).

1. [Elements](plugins/elements/index.md) with `@seminar/elements`:
   [callouts](plugins/elements/callouts.md) that point at content and
   [columns](plugins/elements/columns.md) for content side by side.
2. [Math](plugins/mathjax/index.md) with `@seminar/plugin-mathjax`: writing math,
   fonts, and macros.
   - [Dynamic math](plugins/mathjax/dynamic.md): math that changes while you
     present.
3. [Diagrams](plugins/pele/index.md) with `@seminar/plugin-pele`: Mermaid
   diagrams in the font and colors of the theme.
4. [Highlighting code](plugins/shiki/index.md) with `@seminar/plugin-shiki`: themes,
   and other languages.
