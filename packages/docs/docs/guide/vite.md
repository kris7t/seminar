---
sidebar_position: 2
---

# Vite setup

[Vite](https://vite.dev/guide/) serves your deck while you edit it and builds
the HTML file you present or share. Seminar needs Node.js 24 or newer.

## Start with the example

Seminar's packages are currently private npm workspaces in its repository.
The example in `packages/example` is a working Vite project:

```sh
git clone https://github.com/kris7t/seminar.git
cd seminar
npm install
npm run build
npm run dev
```

Open the local address printed by Vite. Edit
`packages/example/index.deck.mdx` to change the presentation. The first
build prepares the workspace packages; after that, leave the development
server running while you work.

The example's `vite.config.ts` also selects the TypeScript sources of
workspace packages, so changes to those sources need no separate build.
See [Editing and live preview](editing.md) for the editing workflow.

## Configure the plugins

The basic Vite configuration uses Seminar alongside the React plugin:

```ts
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [seminar(), react()],
});
```

Seminar compiles `.deck.mdx` files and generates their HTML pages. The React
plugin enables updates in place while you edit.

Create a deck such as `index.deck.mdx` in the Vite project root:

```mdx
# My talk

An introduction

### One idea at a time

- Start with the question
- :step Show the evidence
- :step Make the connection
```

The default theme is `@seminar/theme-default`. You can select a different
theme in the deck's [frontmatter](core/decks.md#frontmatter).

Each deck gets its own page; you don't need to write an HTML entry point:

| Deck file                 | Development URL        | Built file                 |
| ------------------------- | ---------------------- | -------------------------- |
| `index.deck.mdx`          | `/`                    | `dist/index.html`          |
| `talk.deck.mdx`           | `/talk.html`           | `dist/talk.html`           |
| `lectures/intro.deck.mdx` | `/lectures/intro.html` | `dist/lectures/intro.html` |

The paths are relative to the Vite project root. For the repository's
example, that is `packages/example`.

## Add presentation features

Enable Seminar plugins in the `plugins` option of `seminar()`:

```ts
export default defineConfig({
  plugins: [
    seminar({
      plugins: [
        '@seminar/elements',
        '@seminar/plugin-mathjax',
        '@seminar/plugin-shiki',
      ],
    }),
    react(),
  ],
});
```

The example already includes these packages. They provide
[callouts and columns](elements/index.md), [math](mathjax/index.md), and
[syntax highlighting](shiki/index.md). The names in this option are Seminar
plugins, while `react()` and `seminar()` themselves are Vite plugins.

## Build and share

In a Vite project, run `vite build` to build every deck. From the Seminar
repository root, build the example with:

```sh
npm run build --workspace @seminar/example
```

The example's presentation is written to
`packages/example/dist/index.html`. By default, each deck is a single HTML
file with its scripts, styles, fonts, and bundled assets inlined. Open it
directly in a browser or send it to someone else. Content that fetches data
or embeds an external website still needs access to those services.

To keep scripts and assets in separate files, pass `selfContained: false`:

```ts
seminar({ selfContained: false });
```

Deploy the whole output directory in this mode. It is useful for hosting
with a Content Security Policy that forbids inline scripts.

See [Presenting](presenting.md) for the controls available in the browser.
