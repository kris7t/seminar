---
sidebar_position: 2
---

# Getting started

Create a presentation project, edit your slides, and share the result as a
single HTML file. You need Node.js 24 or newer.

## Create a project

Run these commands in your terminal:

```sh
npm create seminar@latest my-talk
cd my-talk
npm run dev
```

The setup asks which presentation features to include, which theme to use,
and how to build your presentation. Keep the defaults to start with math
formulas, highlighted code, callouts, and columns, and to share your
presentation as a single HTML file. You can change these choices later.
It also offers to install dependencies (yes by default). If you skip that
step, run `npm install` before `npm run dev`.

Open the local address printed in the terminal. Leave the command running
while you work on your slides.

## Edit your slides

Open `decks/index.deck.mdx` in your editor. The starter includes examples of
the features you selected. Replace them with your own content:

```mdx
# My talk

An introduction

### One idea at a time

- Start with the question
- :step Show the evidence
- :step Make the connection
```

Save the file to see your changes in the browser. The presentation stays on
the slide you are editing. Add more `.deck.mdx` files under `decks/` to keep
several presentations in the same project.

See [Decks and slides](core/decks.md) for the file format and
[Editing and live preview](editing.md) for working in your editor or with a
coding agent.

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

## Build and share

When your presentation is ready, run:

```sh
npm run build
```

Your presentation is written to `dist/index.html`. By default, this is a
single file containing its scripts, styles, fonts, and bundled assets. Open
it directly in a browser, send it to someone else, or upload it to a web
host. Content that fetches data or embeds an external website still needs
access to those services.

If you chose separate scripts and assets during setup, deploy the whole
`dist/` directory instead. Run `npm run preview` to preview the built
presentation locally.

See [Presentation controls](presenting.md) for navigation, presenter notes,
and the other controls available in the browser.

## Project files

| Location | What to put there                           |
| -------- | ------------------------------------------- |
| `decks/` | Presentations and their assets              |
| `src/`   | React components and custom theme code      |
| `dist/`  | Built presentations, replaced on each build |

If you chose an editable theme, change `src/theme.ts` to customize its
palette, fonts, or components. It applies to every deck in the project.
See [Themes](../developer/themes.md) for more customization options.

## Initializer options

To create a project with the defaults without answering prompts:

```sh
npm create seminar@latest my-talk -- --yes
```

You can also supply individual choices:

```sh
npm create seminar@latest my-talk -- --plugins elements,mathjax --theme custom --self-contained --install
```

| Option                | Choice                                                        |
| --------------------- | ------------------------------------------------------------- |
| `--plugins`           | Comma-separated `elements`, `mathjax`, and `shiki`, or `none` |
| `--theme default`     | Use the packaged theme                                        |
| `--theme custom`      | Create an editable `src/theme.ts` with Roboto fonts           |
| `--self-contained`    | Inline scripts and assets into each HTML file (default)       |
| `--no-self-contained` | Keep scripts and assets in separate files for web hosting     |
| `--install`           | Install dependencies after creating the project (default)     |
| `--no-install`        | Leave dependency installation for later                       |
| `--yes`               | Use defaults for any choices not supplied                     |

`--yes` also installs dependencies unless you supply `--no-install`.

Use `.` as the directory to initialize the current directory. The
destination must be empty apart from any `.git` metadata; existing project
files are preserved.

## Configure Vite

Seminar uses [Vite](https://vite.dev/guide/) to serve decks while you edit
them and build their HTML pages. The initializer sets this up for you in
`vite.config.ts`. You only need to edit it when changing the project setup
or adding plugins.

The basic configuration uses Seminar alongside the React plugin:

```ts
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'decks',
  plugins: [seminar(), react()],
  build: { outDir: '../dist', emptyOutDir: true },
});
```

`root: 'decks'` keeps deck discovery inside `decks/`, while
`outDir: '../dist'` puts build output in the project's `dist/` directory.
Components and test fixtures in `src/` are not treated as presentation
entries. The React plugin enables updates in place while you edit.

Each deck gets its own page; you don't need to write an HTML entry point:

| Deck file                       | Development URL        | Built file                 |
| ------------------------------- | ---------------------- | -------------------------- |
| `decks/index.deck.mdx`          | `/`                    | `dist/index.html`          |
| `decks/talk.deck.mdx`           | `/talk.html`           | `dist/talk.html`           |
| `decks/lectures/intro.deck.mdx` | `/lectures/intro.html` | `dist/lectures/intro.html` |

The generated `build` command checks TypeScript before running `vite build`.
Use `npm run typecheck` to check types without building the presentations.

### Aliases and a default theme

Generated projects map `@/` to `src/` in both Vite and TypeScript. A deck can
import a component with `import Example from '@/Example'`. If you choose a
custom theme, the initializer also selects it as the default for all decks:

```ts
import { fileURLToPath } from 'node:url';
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'decks',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [seminar({ defaultTheme: '@/theme.ts' }), react()],
  build: { outDir: '../dist', emptyOutDir: true },
});
```

For TypeScript to check those imports, `tsconfig.json` includes matching paths:

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

Seminar also respects Vite aliases in theme and plugin references. A deck can
override `defaultTheme` with `theme: '@/another-theme.ts'` in its
[frontmatter](core/decks.md#frontmatter). Without a custom theme, Seminar uses
`@seminar/theme-default`.

### Add presentation features

Install the plugins you want to add:

```sh
npm install @seminar/elements @seminar/plugin-mathjax @seminar/plugin-shiki
```

Enable them in the `plugins` option of `seminar()`:

```ts
seminar({
  plugins: [
    '@seminar/elements',
    '@seminar/plugin-mathjax',
    '@seminar/plugin-shiki',
  ],
});
```

They provide [callouts and columns](plugins/elements/index.md),
[math](plugins/mathjax/index.md), and [syntax highlighting](plugins/shiki/index.md). The
initializer installs and configures the ones you select during setup.

### Separate scripts and assets

Change the `selfContained` option in `vite.config.ts` to keep scripts and
assets in separate files:

```ts
seminar({ selfContained: false });
```

Deploy the whole output directory in this mode. It is useful for hosting
with a Content Security Policy that forbids inline scripts. Set
`selfContained: true` to return to single-file builds.

### Content for clients without JavaScript

The page of each deck starts with the deck in two forms for clients without
JavaScript:

- Its Markdown source, collapsed, which reads as plain text: without MDX
  comments, imports, and the settings of the presentation in the frontmatter,
  like `theme`, and with the sources of the slides that it includes from other
  decks instead of the `::include` directives.
- Its slides rendered as a plain document: headings, text, presenter notes,
  MathML for formulas, and code without highlighting. The headings link to
  their slides, so following such a link with JavaScript shows the slide.

Text extractors and AI tools that can't open a browser can read the deck from
them, and they stay in pages saved from the browser. Browsers that run the
deck hide them, so they neither flash nor reach screen readers. Change the
`content` option to embed something else:

```ts
seminar({ content: 'markdown' });
```

- `'both'`, the default, embeds the Markdown before the rendered deck. If
  rendering the deck on the server fails, e.g., because a component needs a
  browser, the build warns and only embeds the Markdown.
- `'ssr'` only embeds the rendered deck, or the Markdown if rendering fails.
- `'markdown'` only embeds the Markdown.
- `'none'` embeds nothing.

## Install manually

To add Seminar to an existing Vite project, install its packages and React
and Material UI peers:

```sh
npm install @seminar/core @seminar/theme-default react react-dom @mui/material @emotion/react @emotion/styled
npm install --save-dev @seminar/mdx @seminar/vite-plugin @vitejs/plugin-react vite typescript @types/node @types/react @types/react-dom
```

Add the Seminar and React plugins to `vite.config.ts`, as shown in
[Configure Vite](#configure-vite). With that configuration, create your deck
in `decks/index.deck.mdx`. For TypeScript imports of decks, add
`@seminar/mdx/client` to `tsconfig.json`'s `compilerOptions.types`.
