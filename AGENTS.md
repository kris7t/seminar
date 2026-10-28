# Seminar

Monorepo of npm workspaces in `packages/` that turns `.deck.mdx` files into
React presentations. See `README.md` for the features and the syntax of decks.

## Packages

- `core`: the `Deck` and `Slide` components, steps, navigation, the presenter
  view, and the UI around the slides.
- `mdx`: the remark, rehype, and recma plugins that compile decks.
- `rollup-plugin` and `vite-plugin`: build integration. The Vite plugin also
  generates the HTML pages of decks, makes them self-contained, and updates
  them in place in the dev server.
- `elements`, `plugin-mathjax`, `plugin-pele`, `plugin-shiki`, `theme-default`:
  components, plugins, and the default theme.
- `create`: the `create-seminar` initializer, released with the libraries.
- `cli`: the `seminar` command, which presents built decks and saves them as
  PDFs with an Electron that it downloads, and whose apps give decks a
  `seminarHost`. On Wayland, it places the audience window with the wlr
  foreign toplevel management protocol, with a client in `src/app/wayland/`.
- `example`: the example deck, also used for trying out changes by hand.
- `docs`: the Docusaurus site, with guides in `packages/docs/docs/`.

Workspace packages resolve to their TypeScript sources through the
`@seminar/source` export condition, so most changes need no build.

## Commands

- `npm run dev`: serve the example deck.
- `npm run present`: build the command line and the example deck, and
  present it with `seminar present`.
- `npm run docs:dev`: serve the documentation site.
- `npm run docs:build`, `npm run docs:preview`: build and preview the docs.
- `npm test`, or `npx vitest run <path>` for some of the tests.
- `npm run lint`, `npm run format`, `npm run typecheck`.
- `npm run check` runs everything before a commit.
- `scripts/android/`: reproduce bugs of Chrome on Android in an emulator, see
  its `README.md`.

Run tests with sandbox escalation by default, including `npm run check`,
which runs the tests. Vite dev-server tests need permission to listen on
`127.0.0.1`; the sandbox blocks this with `listen EPERM` and a setup-hook
timeout.

## Conventions

- Write code that reads like the surrounding code. Only comment on why
  something is done if it isn't obvious, and give public APIs doc comments.
- Add tests for fixes and features, and make sure they fail without the
  change.
- Commit directly on `main`; don't create branches.
- Commit messages have a summary in the imperative that says what changes
  for users, without a prefix, and a body that explains why if it isn't
  obvious.
- Include a `Co-Authored-By` trailer in commit messages you write.
