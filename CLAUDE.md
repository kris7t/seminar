# slider

Monorepo of npm workspaces in `packages/` that turns `.deck.mdx` files into
React presentations. See `README.md` for the features and the syntax of decks.

## Packages

- `core`: the `Deck` and `Slide` components, steps, navigation, the presenter
  view, and the UI around the slides.
- `mdx`: the remark, rehype, and recma plugins that compile decks.
- `rollup-plugin` and `vite-plugin`: build integration. The Vite plugin also
  generates the HTML pages of decks, makes them self-contained, and updates
  them in place in the dev server.
- `elements`, `plugin-mathjax`, `plugin-shiki`, `theme-default`: components,
  plugins, and the default theme.
- `example`: the example deck, also used for trying out changes by hand.

Workspace packages resolve to their TypeScript sources through the
`@slider/source` export condition, so most changes need no build.

## Commands

- `npm run dev`: serve the example deck.
- `npm test`, or `npx vitest run <path>` for some of the tests.
- `npm run lint`, `npm run format`, `npm run typecheck`.
- `npm run check` runs everything before a commit.

## Conventions

- Write code that reads like the surrounding code. Only comment on why
  something is done if it isn't obvious, and give public APIs doc comments.
- Add tests for fixes and features, and make sure they fail without the
  change.
- Commit directly on `main`; don't create branches.
- Commit messages have a summary in the imperative that says what changes
  for users, without a prefix, and a body that explains why if it isn't
  obvious.
