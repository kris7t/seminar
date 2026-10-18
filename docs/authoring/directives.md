# Directives and plugins

A plugin, or a theme, can make components available as Markdown
[directives](../README.md#syntax-at-a-glance), so that decks don't have to
import them. `@slider/elements` is such a plugin.

## Registering directives

A plugin package lists its directives in the `slider` key of its
`package.json`:

```json
{
  "name": "my-elements",
  "slider": {
    "directives": {
      "note": {
        "source": "my-elements",
        "exportName": "Note",
        "formProp": "directive",
        "labelProp": "heading"
      }
    }
  }
}
```

Decks then use `:::note` once the plugin is enabled:

```ts
slider({ plugins: ['my-elements'] });
```

A package with several configurations, e.g., several themes, can point to a
JSON file with the `slider` export condition instead, e.g.,
`"exports": { ".": { "slider": "./slider.json", "default": "./dist/index.js" } }`.
A local module, like a theme in `./src/theme.tsx`, exports the same object as
`slider`:

```ts
import type { SliderConfig } from '@slider/core';

export const slider: SliderConfig = {
  directives: { note: { source: 'my-elements', exportName: 'Note' } },
  math: { font: 'fira' },
};
```

Decks import `source` as it's written, so it should be a package name, rather
than a relative path, which would be relative to each deck.

To read its `slider` export, the theme or plugin module itself is loaded when
decks are compiled, in Node rather than the browser. So it shouldn't touch
browser globals like `window` at the top level, and the packages it imports
must be built to JavaScript. The components that directives map to, on the
other hand, are imported by the decks, and run in the browser like any other
component.

The configs of the plugins are applied in order, and the config of the theme
last, so a theme can replace the components of plugins. The same config can
also set [math options](../core/content.md#math), like macros.

## Props from directives

A directive turns into its component with these props:

- Each attribute becomes a prop of the same name, with `#name` as `id` and
  `.class` as `className`.
- The content becomes the `children`: the label of a text or leaf directive,
  e.g., `Hello` in `:note[Hello]`, or the Markdown inside a container.
- With `formProp`, the component learns how the directive was written: `text`
  for `:note`, `leaf` for `::note`, and `container` for `:::note`. Use it to
  choose sensible defaults, e.g., to lay out blocks rather than text.
- With `labelProp`, the label of a container, `:::note[Title]`, goes to that
  prop as plain text, rather than being the first paragraph of the children.

Attribute values are always strings, and bare flags like `{step}` are empty
strings. So props that a directive may set should accept strings: numbers
like `width` as `number | string`, and flags as `boolean | ''`, where `''`
means `true`.

## Wrapping consecutive directives

`wrapIn` wraps consecutive directives of this kind in a container directive,
unless they're directly in one already. `@slider/elements` registers `column`
with `"wrapIn": "columns"`, so that consecutive `:::column`s don't need a
`::::columns` around them. The wrapper has no attributes, so users write it
explicitly to set them.

## Guidelines

- **Keep directive components thin.** Map the directive to a component with
  a clean JSX API, like `CalloutDirective` does for `Callout`. Keep Markdown
  details out of the component itself.
- **Pass the other props on to a `Step`.** Then `:step` attributes work on
  the directive. See [Steps in components](steps.md).
- **Use short, lowercase names.** Name it like the HTML element it stands
  for, like `column`, and its wrapper in the plural, like `columns`.

## Compiler plugins

A plugin or a theme can add plugins of [unified](https://unifiedjs.com) to
the compiler. List them in the `mdx` key of its config:

```json
{
  "slider": {
    "mdx": {
      "rehypePlugins": {
        "after": [{ "source": "my-code/rehype", "exportName": "rehypeMyCode" }]
      }
    }
  }
}
```

There are three stages:

- `remarkPlugins` work on the Markdown syntax tree.
- `rehypePlugins` work on the HTML syntax tree.
- `recmaPlugins` work on the JavaScript of the compiled deck.

Each stage takes plugins that run `before` or `after` the plugins of Slider.
Remark plugins in `before` can add syntax to Markdown, like math.

The plugins are loaded in Node when decks are compiled. They may use
packages that decks shouldn't contain, like a highlighter. Their modules
must be built to JavaScript.

If a plugin can't be loaded, you get a warning, and the deck is compiled
without it.

`@slider/plugin-shiki` is such a plugin. Its rehype plugin highlights code
blocks.

### Using other plugins

A plugin or a theme can use other plugins. List them in its `plugins` key:

```json
{ "slider": { "plugins": ["@slider/plugin-shiki"] } }
```

They are loaded before it, so it can override their options. Each plugin is
loaded once, even if several configs list it.

### Options

Compiler plugins take no options directly. Configs set them in their
`options` key instead, by the name that the plugin reads, and decks override
them in the frontmatter, e.g., for the `code` options of `@slider/plugin-shiki`:

```ts
export const slider: SliderConfig = {
  options: { code: { theme: 'github-dark' } },
};
```

```yaml
code:
  theme: min-light
```

Plugins read them with `getSliderOptions(file, 'code')` of `@slider/mdx`,
which merges the options of the plugins, the theme, and the frontmatter, in
order of increasing precedence. Pick a name that isn't a key of the
frontmatter of decks, like `title` or `theme`.

### Utilities

`@slider/mdx` exports utilities for compiler plugins, e.g.:

- `parseAttributeWords` reads attributes written like those of directives,
  but without braces, e.g., in the first line of a code block,
- `getStepProps` turns them into the props of a step, like those of `:step`,
- `createStringAttribute`, `createEsm`, and `EXPLICIT_JSX_HAST` create JSX
  elements and imports in the syntax trees of decks.
