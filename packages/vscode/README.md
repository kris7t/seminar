# Seminar for VS Code

Language support for the `.deck.mdx` files of
[Seminar](https://seminar.run) in VS Code and VSCodium:

- Highlighting of directives, attributes, math, and Mermaid diagrams.
- Checks, hover, and completion for directives and their attributes, code
  blocks, and the JavaScript of decks.
- A preview next to the editor that follows the cursor, and presenting.

## Installing

Build the package from the root of the repository and install it:

```sh
npm run vscode:package
codium --install-extension packages/vscode/dist/seminar.vsix
```

Use `code` for VS Code. Reload the window afterwards.

## Setting up projects

Decks have their own language, `Seminar Deck`, so settings and extensions for
`mdx` don't apply to them. Prettier needs to be told about them:

```json
{ "prettier.documentSelectors": ["**/*.deck.mdx"] }
```

The extension only runs in trusted workspaces, since it runs code of the
workspace: it loads the Vite config of a deck to check and complete the
directives of its plugins and theme, and its code blocks. It loads the config
again when it changes. Run `Seminar: Restart Language Server` to load it
again otherwise, e.g., after installing a plugin.

Augmentations of `StepBehaviorOverrides` and `SlideMasterOverrides` are only
known if they're part of the TypeScript project of the deck.

`$` starts math only if `@seminar/plugin-mathjax` is installed for the deck.
Other plugins that add syntax aren't supported yet.

Set `"mdx": { "checkMdx": true }` in `tsconfig.json` to report type errors in
the JavaScript of decks.

## Previewing

`Seminar: Preview Deck` and `Seminar: Present Deck`, also on the title bar of
the editor, run `seminar`, so `@seminar/cli` has to be installed in the project
of the deck, and Node has to be on the `PATH`.

- `seminar.preview.location`: `editor`, the default, shows the preview in a
  panel, where P fills the panel with the slides and Shift+P shows the
  presenter view. `window` opens it in the app of `seminar preview`, with all
  of its features.
- `seminar.preview.sync`: `both`, the default, `editorToPreview`,
  `previewToEditor`, or `off`, whether previews follow the cursor, and editors
  follow the slide and step of the preview.
- `seminar.preview.dimHidden`: whether editors fade what can't be read at the
  current step of the preview, on by default.

`Seminar: Preview Deck in the Editor` and `Seminar: Preview Deck in a Window`
choose the location themselves. Ctrl+click, or Cmd+click, in a preview goes to
the source. The Seminar sidebar shows the contents of the previewed deck.

Previews of a project share a dev server. Its errors and warnings are in the
`Seminar Dev Server` output channel, see `Seminar: Show Dev Server Output`. In
remote workspaces, it runs on the remote machine, and previews in a window
open in the browser. Remote workspaces haven't been tested yet.

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

## Developing

`syntaxes/source.mdx.tmLanguage` is an unmodified copy of the
[grammar of MDX](https://github.com/wooorm/markdown-tm-language), used under
the MIT license in `syntaxes/LICENSE.source.mdx.txt`. Replace it to update the
grammar. `renderDeckGrammar` in `src/grammar.ts` turns it into the grammar of decks
when building. The grammar of Mermaid comes from `@shikijs/langs`, also when building. The rest of the syntax is injected by the grammars next
to it, which include the grammar of TeX that comes with the editor.
