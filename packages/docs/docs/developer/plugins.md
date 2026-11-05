---
sidebar_position: 5
---

# Plugins

A plugin extends how decks are compiled. It can:

- make components available as [directives](directives.md),
- add plugins of [unified](https://unifiedjs.com) to the compiler, like
  math or syntax highlighting,
- use other plugins,
- set the options of other plugins.

A presentation theme can do the same.

## The config

A plugin describes what it adds in its `seminar` config. A package puts it in
the `seminar` key of its `package.json`:

```json
{
  "name": "my-elements",
  "seminar": {
    "directives": {
      "note": { "source": "my-elements", "exportName": "Note" }
    }
  }
}
```

A package with several configs, like several themes, can point to a JSON
file with the `seminar` export condition instead:

```json
"exports": { ".": { "seminar": "./seminar.json", "default": "./dist/index.js" } }
```

A local module, like a theme in `./src/theme.tsx`, exports the config as
`seminar`:

```ts
import type { SeminarConfig } from '@seminar/core';

export const seminar: SeminarConfig = {
  plugins: ['@seminar/plugin-mathjax'],
  options: { math: { font: 'newcm' } },
};
```

The config is read in Node when decks are compiled, not in the browser. So a
module with a config shouldn't use browser globals like `window` at the top
level. The packages it imports must be built to JavaScript.

## Enabling plugins

List plugins in the options of the Seminar plugin of Vite or Rollup:

```ts
seminar({ plugins: ['my-elements'] });
```

With Vite, plugin names can also use the project's aliases, such as
`plugins: ['@/presentation-plugin.ts']`. Aliases apply to plugin references in
configs and to the `source` entries of compiler plugins too. See
[Aliases and a default theme](../guide/getting-started.md#aliases-and-a-default-theme).

The configs of the plugins apply in order. The config of the theme of the
deck applies last, so the theme can override the plugins.

## Using other plugins

A plugin or a theme can use other plugins. List them in its `plugins` key:

```json
{ "seminar": { "plugins": ["@seminar/plugin-shiki"] } }
```

They are loaded before it, so it can override their options. Each plugin is
loaded once, even if several configs list it.

## Options

Plugins of the compiler take no options directly. Configs set them in their
`options` key instead, by the name of the plugin's options:

```ts
export const seminar: SeminarConfig = {
  options: { code: { theme: 'github-dark' } },
};
```

Decks override them in the key of the same name in their frontmatter:

```yaml
code:
  theme: min-light
```

Components read the options of the deck with `useSeminarOptions(name)` of
`@seminar/core`. The `Deck` gets them as its `options` prop.

## Compiler plugins

A plugin can add plugins of unified to the compiler. List them in the `mdx`
key of its config:

```json
{
  "seminar": {
    "mdx": {
      "rehypePlugins": {
        "after": [
          { "source": "my-links/rehype", "exportName": "rehypeMyLinks" }
        ]
      }
    }
  }
}
```

There are three stages:

- `remarkPlugins` work on the Markdown syntax tree.
- `rehypePlugins` work on the HTML syntax tree.
- `recmaPlugins` work on the JavaScript of the compiled deck.

Each stage takes plugins that run `before` or `after` the plugins of Seminar.
Remark plugins in `before` can add syntax to Markdown, like math.

The plugins are loaded in Node when decks are compiled. They may use
packages that decks shouldn't contain, like a highlighter. Their modules
must be built to JavaScript.

If a plugin can't be loaded, you get a warning, and the deck is compiled
without it.

`@seminar/plugin-mathjax` and `@seminar/plugin-shiki` are plugins like this.

### Reading options

Plugins read their options with `getSeminarOptions(file, name)` of
`@seminar/mdx`. It merges the options of the plugins, the theme, and the
frontmatter, in this order. `getSeminarOptionLayers` returns them one by one,
with the file to resolve paths from.

Pick a name that isn't a key of the frontmatter of decks, like `title` or
`theme`.

Decks get the options of every name that a config sets. They are merged the
same way. To give components other values, call
`setRuntimeSeminarOptions(file, name, code)` in a remark or rehype plugin.
`code` is a JavaScript expression. It can use the imports that the plugin
adds to the deck.

`@seminar/plugin-mathjax` does this, since it merges macros, and gives
components functions that import the font of the deck.

### Code blocks

To render code blocks, a plugin doesn't need a compiler plugin. It registers
a handler and a component for their language in `codeBlocks`, or for `*`,
the other languages:

```json
"codeBlocks": {
  "dot": {
    "handler": { "source": "my-graphs/code", "exportName": "graphBlocks" },
    "component": { "source": "my-graphs", "exportName": "Graph" }
  }
}
```

The compiler finds the code blocks and reads the words after their
language. It gives each block to the handler of its language, or else to
the handler of `*`, and renders it with the component of the handler.
Blocks without one are plain `CodeBlock`s of `@seminar/core`. As with
directives, the last config wins for each language.

The handler is a function that the compiler calls once for each deck, with
its `file`, and that returns a function for the blocks of the deck:

```ts
import type { CodeBlockHandlerFactory } from '@seminar/mdx';

export const graphBlocks: CodeBlockHandlerFactory =
  ({ file }) =>
  async ({ code, lang, meta, place }) => {
    if (!isGraph(code)) {
      file.message('Cannot render the graph', { place });
      return undefined;
    }
    return {
      props: { source: code, layout: await layOut(code) },
      imports: {
        engine: { source: 'my-graphs/engine', exportName: 'default' },
      },
    };
  };
```

- `props` are JSON, and `imports` are props whose values the deck imports.
  `children` are elements of the HTML syntax tree, like highlighted code.
- The attributes after the language, like `#graph step`, are passed to the
  component like those of `:step`, so the component should pass them on to a
  `Step`. `meta` has the other words, like `{1-3}`.
- Returning `undefined` leaves the block to the handler of `*`. For example,
  `@seminar/plugin-pele` registers `mermaid`, and leaves diagrams that it
  can't parse to `@seminar/plugin-shiki`, which registers `*`.

The editor checks the attributes against the props of the component, other
than `lang`, `code`, `meta`, and `children`. If the handler sets other props,
like the `source` of a diagram, name the type of what can be written after
the language in `attributes`, like `"attributes": { "source": "my-graphs",
"exportName": "GraphBlockAttributes" }`. Like compiler plugins, handlers are
loaded in Node, and must be built to JavaScript.

### Utilities

`@seminar/mdx` exports utilities for compiler plugins:

- `parseAttributeWords` reads attributes written like those of directives,
  but without braces, like in the first line of a code block.
- `getStepProps` turns attributes into the props of a step.
- `createStringAttribute`, `createEsm`, and `EXPLICIT_JSX_HAST` create JSX
  elements and imports in the syntax trees of decks.
