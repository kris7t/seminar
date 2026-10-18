# slider documentation

These pages describe how to write slider decks in MDX: Markdown with
directives, attributes, and React components, and how to write components,
plugins, and themes for them. Read them in order the first time, and come
back to look things up.

> slider is a proof of concept, so the syntax may still change.

## Core

What every deck can use, provided by `@slider/core` and `@slider/mdx`:

1. [Decks and slides](core/decks.md): the deck file, its frontmatter, and how
   headings turn into slides.
2. [Content](core/content.md): lists, paragraphs, images, math, code, notes,
   and React components on slides, and naming elements on a slide.
3. [Steps](core/steps.md): revealing content step by step, and how steps look
   before and after their turn.
4. [Recaps and includes](core/reuse.md): showing a slide again, and reusing
   slides of other decks.

## Elements

Presentation elements from the `@slider/elements` plugin:

1. [Using elements](elements/README.md): enabling the plugin.
2. [Callouts](elements/callouts.md): speech bubbles pointing at text, images,
   or other elements.
3. [Columns](elements/columns.md): content side by side.

## Plugins

1. [Math](mathjax/README.md) with `@slider/plugin-mathjax`: writing math,
   fonts, and macros.
   - [Dynamic math](mathjax/dynamic.md): math that changes while you
     present.
2. [Highlighting code](shiki/README.md) with `@slider/plugin-shiki`: themes,
   and other languages.

## Authoring

Writing components, plugins, and themes for decks:

1. [Authoring components](authoring/README.md): an overview and guidelines.
2. [Components on slides](authoring/components.md): slide state, views,
   input, and naming and measuring elements.
3. [Steps in components](authoring/steps.md): `Step`, default placement, and
   steppers.
4. [Directives](authoring/directives.md): making components available as
   directives.
5. [Plugins](authoring/plugins.md): configs, options, and compiler plugins.
6. [Themes](authoring/themes.md): masters, theming components, and step
   behaviors.

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
