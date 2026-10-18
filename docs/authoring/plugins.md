# Plugins

A plugin extends how decks are compiled. It can:

- make components available as [directives](directives.md),
- add plugins of [unified](https://unifiedjs.com) to the compiler, like
  math or syntax highlighting,
- use other plugins,
- set the options of other plugins.

A presentation theme can do the same.

## The config

A plugin describes what it adds in its `slider` config. A package puts it in
the `slider` key of its `package.json`:

```json
{
  "name": "my-elements",
  "slider": {
    "directives": {
      "note": { "source": "my-elements", "exportName": "Note" }
    }
  }
}
```

A package with several configs, like several themes, can point to a JSON
file with the `slider` export condition instead:

```json
"exports": { ".": { "slider": "./slider.json", "default": "./dist/index.js" } }
```

A local module, like a theme in `./src/theme.tsx`, exports the config as
`slider`:

```ts
import type { SliderConfig } from '@slider/core';

export const slider: SliderConfig = {
  plugins: ['@slider/plugin-mathjax'],
  options: { math: { font: 'newcm' } },
};
```

The config is read in Node when decks are compiled, not in the browser. So a
module with a config shouldn't use browser globals like `window` at the top
level. The packages it imports must be built to JavaScript.

## Enabling plugins

List plugins in the options of the slider plugin of Vite or Rollup:

```ts
slider({ plugins: ['my-elements'] });
```

The configs of the plugins apply in order. The config of the theme of the
deck applies last, so the theme can override the plugins.

## Using other plugins

A plugin or a theme can use other plugins. List them in its `plugins` key:

```json
{ "slider": { "plugins": ["@slider/plugin-shiki"] } }
```

They are loaded before it, so it can override their options. Each plugin is
loaded once, even if several configs list it.

## Options

Plugins of the compiler take no options directly. Configs set them in their
`options` key instead, by the name of the plugin's options:

```ts
export const slider: SliderConfig = {
  options: { code: { theme: 'github-dark' } },
};
```

Decks override them in the key of the same name in their frontmatter:

```yaml
code:
  theme: min-light
```

## Compiler plugins

A plugin can add plugins of unified to the compiler. List them in the `mdx`
key of its config:

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

`@slider/plugin-mathjax` and `@slider/plugin-shiki` are plugins like this.

### Reading options

Plugins read their options with `getSliderOptions(file, name)` of
`@slider/mdx`. It merges the options of the plugins, the theme, and the
frontmatter, in this order. `getSliderOptionLayers` returns them one by one,
with the file to resolve paths from.

Pick a name that isn't a key of the frontmatter of decks, like `title` or
`theme`.

### Utilities

`@slider/mdx` exports utilities for compiler plugins:

- `parseAttributeWords` reads attributes written like those of directives,
  but without braces, like in the first line of a code block.
- `getStepProps` turns attributes into the props of a step.
- `createStringAttribute`, `createEsm`, and `EXPLICIT_JSX_HAST` create JSX
  elements and imports in the syntax trees of decks.
