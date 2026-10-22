# Seminar documentation site

This workspace builds the Seminar website with
[Docusaurus](https://docusaurus.io/). The landing page is in
`src/pages/index.tsx`; the [User guide](docs/guide/index.md) and
[Developers](docs/developer/index.md) each have their own sidebar.

From the repository root:

```sh
npm run docs:dev      # serve with hot reloading at http://localhost:3000
npm run docs:build    # build the static site in packages/docs/dist
npm run docs:preview  # serve the production build locally
```

The root `npm run build` and `npm run check` include the site build. Broken
links and anchors fail the build.

Add user-facing guides under `docs/guide/` and component, plugin, and theme
development guides under `docs/developer/`. Each sidebar follows its folder
structure; set `sidebar_position` in a guide's frontmatter to order it within
its section.
Use `index.md` for section overviews and `_category_.json` for section labels
and positions.
Plugin usage guides live under `docs/guide/plugins/`. Writing decks uses
`link.type: "generated-index"` in its metadata for an overview with automatic
cards. Plugins uses an `index.mdx` with `<DocCardList />` so its introduction
can include links while its cards still follow the sidebar automatically.

Use relative `.md` links between guides so they also work when browsing the
repository. The `.md` files use Markdown syntax; use `.mdx` for pages that
need React components.
