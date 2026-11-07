# Seminar for VS Code

Language support for the `.deck.mdx` files of [Seminar](https://seminar.run),
which turns Markdown into React presentations, in VS Code and VSCodium:

- Highlighting of directives, attributes, math, and Mermaid diagrams.
- Checks, hover, and completion for directives and their attributes, code
  blocks, and the JavaScript of decks.
- A preview next to the editor that follows the cursor, and presenting.

## Getting started

Open a Seminar project, e.g., one created with `npm create seminar`, in a
trusted workspace. The extension only runs in trusted workspaces, since it
runs code of the project: it loads the Vite config of a deck to check and
complete the directives of its plugins and theme, and its code blocks.

Previewing and presenting run the `seminar` command of the project, so
`@seminar/cli` has to be installed in it, and Node has to be on the `PATH`.

## Previewing and presenting

**Seminar: Preview Deck** and **Seminar: Present Deck** are also on the title
bar of the editor. In a preview:

- P fills the panel with the slides, and Shift+P shows the presenter view.
- Ctrl+click, or Cmd+click, goes to the source.
- The Seminar sidebar shows the contents and the steps of the deck.

**Seminar: Preview Deck in the Editor** and **Seminar: Preview Deck in a
Window** choose where the preview opens, see `seminar.preview.location`.

Previews of a project share a dev server. Its errors and warnings are in the
`Seminar Dev Server` output channel, see **Seminar: Show Dev Server Output**.
In remote workspaces, it runs on the remote machine, and previews in a window
open in the browser. Remote workspaces haven't been tested yet.

## Settings

- `seminar.preview.location`: `editor`, the default, shows the preview in a
  panel of the editor, where the deck can't open windows, go full screen, or
  print. `window` opens it in the app of `seminar preview`, with all of its
  features, or in the browser in a remote workspace.
- `seminar.preview.sync`: whether previews follow the cursor, and editors
  follow the slide and step of the preview. `both`, the default,
  `editorToPreview`, `previewToEditor`, or `off`.
- `seminar.preview.dimHidden`: whether editors fade what can't be read at the
  current step of the preview, on by default.

## Projects

Decks have their own language, `Seminar Deck`, so settings and extensions for
`mdx` don't apply to them. Prettier needs to be told about them:

```json
{ "prettier.documentSelectors": ["**/*.deck.mdx"] }
```

Set `"mdx": { "checkMdx": true }` in `tsconfig.json` to report type errors in
the JavaScript of decks.

The extension loads the Vite config of a deck again when it changes. Run
**Seminar: Restart Language Server** to load it again otherwise, e.g., after
installing a plugin.

Augmentations of `StepBehaviorOverrides` and `SlideMasterOverrides` are only
known if they're part of the TypeScript project of the deck, whose
`tsconfig.json` has to include the deck, e.g., with `**/*.mdx` in `include`,
like projects made with `npm create seminar`. Those of the theme of the deck
are always known, since the extension imports the theme for its types.

`$` starts math only if `@seminar/plugin-mathjax` is installed for the deck.
Other plugins that add syntax aren't supported yet.

## Colors

Syntax gets the common scopes of programming languages, so that themes color
it. Every token also has a scope of its own, which takes precedence, for
themes and for `editor.tokenColorCustomizations`. Step behaviors and slide
masters are semantic tokens, `seminarStepBehavior` and `seminarSlideMaster`,
which fall back to the scopes below.

| Scope                               | Syntax                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `seminar.directive.delimiter`       | `:`, `::`, `:::`                                                                       |
| `seminar.directive.delimiter.step`  | The `:` of `:step` and `:step{…}` without a label, and `%%` in `%% step` without items |
| `seminar.directive.delimiter.reuse` | `::` of `::include`, `::recap`                                                         |
| `seminar.directive.delimiter.slide` | `::` of `::slide`                                                                      |
| `seminar.directive.name`            | Names of directives, and these:                                                        |
| `seminar.directive.name.step`       | `step` in `:step`, `:step{…}`, and `%% step`                                           |
| `seminar.directive.name.reuse`      | `::include`, `::recap`                                                                 |
| `seminar.directive.name.notes`      | `:::notes`                                                                             |
| `seminar.directive.name.slide`      | `::slide`                                                                              |
| `seminar.directive.label.delimiter` | `[` and `]`                                                                            |
| `seminar.directive.label.text`      | The text between them                                                                  |
| `seminar.notes.text`                | Unstyled text in notes                                                                 |
| `seminar.attribute.delimiter`       | `{` and `}`                                                                            |
| `seminar.attribute.id`              | `#id`                                                                                  |
| `seminar.attribute.class`           | `.class`                                                                               |
| `seminar.attribute.name`            | `key` in `key=value`, and bare words                                                   |
| `seminar.attribute.name.step`       | A bare `step`, and step behaviors among the props of directives, images, and code      |
| `seminar.attribute.name.master`     | Slide masters among the attributes of slides                                           |
| `seminar.attribute.separator`       | `=`                                                                                    |
| `seminar.attribute.value`           | `value` in `key=value`                                                                 |
| `seminar.math.delimiter`            | `$`, `$$`                                                                              |
| `seminar.math.content`              | Math, which also has the scopes of TeX                                                 |
| `seminar.step.item`                 | Items in `%% step[a, a->b]`                                                            |
| `seminar.step.item.operator`        | `->`                                                                                   |
| `seminar.step.item.separator`       | `,`                                                                                    |

## License

Apache-2.0. The grammar of decks builds on the
[grammar of MDX](https://github.com/wooorm/markdown-tm-language), used under
the MIT license.
