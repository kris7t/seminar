---
sidebar_position: 2
---

# Vite setup

[Vite](https://vite.dev/guide/) serves your deck while you edit it and builds
the HTML file you present or share. Seminar needs Node.js 24 or newer.

## Create a project

The initializer creates a working project and asks which plugins to enable and
whether to use the default theme or create an editable `src/theme.ts`:

```sh
npm create seminar@latest my-talk
cd my-talk
npm install
npm run dev
```

Elements, MathJax, and Shiki are selected by default. The starter deck includes
examples of the features you choose. A custom theme uses `createSlideTheme`,
imports Roboto's normal and italic weights, and adds `@fontsource/roboto` as a
direct dependency. Edit `src/theme.ts` to change its palette, fonts, or
components.

To skip the prompts, supply all choices:

```sh
npm create seminar@latest my-talk -- --plugins elements,mathjax --theme custom
```

`--plugins` accepts `elements`, `mathjax`, and `shiki`, separated by commas, or
`none` to omit all optional plugins. `--theme` accepts `default` or `custom`.
`--yes` uses defaults for any missing choices: `my-talk`, all plugins, and the
default theme. Use `.` as the directory to initialize the current directory.
The destination must be empty apart from any `.git` metadata; existing project
files are preserved.

The starter deck is `decks/index.deck.mdx`. The Vite configuration uses
`root: 'decks'` and `build: { outDir: '../dist', emptyOutDir: true }`, so deck
discovery stays inside `decks/` and output goes to the project's `dist/`.
Components, themes, and test fixtures can live in `src/` without being picked
up as presentation entries. Custom decks reference the generated theme with
`theme: ../src/theme.ts` in their frontmatter.

The generated project has `dev`, `build`, `preview`, and `typecheck` scripts.
`build` checks TypeScript and produces a self-contained `dist/index.html`.

## Install manually

Create a project and install Seminar with its React and Material UI peers:

```sh
mkdir my-talk
cd my-talk
npm init -y
npm pkg set type=module scripts.dev=vite 'scripts.build=vite build'
npm install @seminar/core react react-dom @mui/material @emotion/react @emotion/styled
npm install --save-dev @seminar/vite-plugin @vitejs/plugin-react vite typescript @types/react @types/react-dom
```

Create `vite.config.ts` using the configuration below and add an
`index.deck.mdx` file. Run `npm run dev` to preview it or `npm run build` to
produce the HTML file. For TypeScript imports of decks, add
`@seminar/mdx/client` to your `tsconfig.json`'s `compilerOptions.types`.

## Try the repository example

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

The paths are relative to the Vite project root. For generated projects, that
is `decks/`; for the repository's example, it is `packages/example`.

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

Install the plugins you enable with `npm install @seminar/elements
@seminar/plugin-mathjax @seminar/plugin-shiki`. The repository example already
includes them. They provide
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
