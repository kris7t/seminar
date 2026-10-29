# create-seminar

Create a [Seminar](https://seminar.run) presentation project with Vite.
Requires Node.js 22 or newer.

```sh
npm create seminar@latest my-talk
cd my-talk
npm run dev
```

Choose which plugins to enable: Elements (callouts and columns), MathJax
(math formulas), Pele (Mermaid diagrams), and Shiki (syntax highlighting). All
four are selected by default. Then choose the default theme or an editable `src/theme.ts`, and
whether to inline scripts and assets into each HTML file (on by default).
Choose which PDFs `npm run pdf` saves: the slides (selected by default),
handouts with notes, or handouts with 2, 4, or 6 slides on each sheet. With
none selected, the project has no `npm run pdf`. Every project has
`npm run present`, which builds the presentation and presents it with the
presenter view, choosing the screen of the slides without browser prompts. Finally, choose whether to install dependencies now (yes by default). If you
skip installation, run `npm install` before `npm run dev`.

The starter includes `decks/index.deck.mdx` with examples of the selected
features, Vite and TypeScript configuration, and commands to develop, build,
preview, and check types. Vite's root is `decks/`, so deck discovery only
searches that directory.
`npm run build` produces `dist/index.html`. By default, it is self-contained;
when disabled, deploy the whole `dist/` directory with its scripts and assets.
Change `selfContained` in `vite.config.ts` to switch formats later.

`build.outDir` is `../dist` relative to the Vite root, keeping build output in
the project's `dist/` directory. Components and fixtures can live in `src/`.

A custom theme uses `createSlideTheme` and imports Roboto's normal and italic
weights explicitly. The project depends directly on `@fontsource/roboto`.
The default-theme option uses `@seminar/theme-default`, which bundles Roboto.
A custom theme is selected once with `defaultTheme: '@/theme.ts'` in the
Seminar options of `vite.config.ts`; decks need no theme frontmatter.

Vite and TypeScript both map `@/` to `src/`. For example, a deck can import
`@/MyComponent` from `src/MyComponent.tsx`.

## Command-line options

Supply all choices to skip interactive prompts:

```sh
npm create seminar@latest my-talk -- --plugins elements,mathjax --theme custom --self-contained --install
```

| Option                                  | Meaning                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--plugins elements,mathjax,pele,shiki` | Enable the listed plugins; use `none` or an empty string for no plugins                                              |
| `--theme default`                       | Use `@seminar/theme-default`                                                                                         |
| `--theme custom`                        | Create an editable `src/theme.ts` with Roboto imports                                                                |
| `--self-contained`                      | Inline scripts and assets into each HTML file (default)                                                              |
| `--no-self-contained`                   | Keep scripts and assets in separate files                                                                            |
| `--pdf slides,notes,2up,4up,6up`        | Save the listed PDFs with `npm run pdf`; use `none` for no PDFs (default: `slides`)                                  |
| `--install`                             | Install dependencies after creating the project (default)                                                            |
| `--no-install`                          | Create files without installing dependencies                                                                         |
| `-y`, `--yes`                           | Use defaults: `my-talk`, all plugins, default theme, self-contained builds, PDFs of the slides, install dependencies |
| `-h`, `--help`                          | Show usage                                                                                                           |
| `-v`, `--version`                       | Show the initializer version                                                                                         |

Use `.` as the directory to initialize the current directory. The destination
must be new or empty; an existing `.git` directory or file is preserved.
Existing project files are never overwritten. If installation fails, the
generated files are kept and the command explains how to retry `npm install`.

## Developing the initializer

From the Seminar repository, build it with `npm run build:packages`, then run:

```sh
node packages/create/dist/index.js /tmp/my-talk --plugins elements --theme custom --self-contained --no-install
```

Before the first npm release, generated projects refer to unpublished package
versions. `npm run release:smoke` tests them against local release tarballs.
