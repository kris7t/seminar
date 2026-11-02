# Seminar for VS Code

Language support for the `.deck.mdx` files of
[Seminar](https://seminar.run) in VS Code and VSCodium:

- Highlights directives, the attribute blocks of headings and images, and TeX
  in inline and display math.
- Highlights Mermaid diagrams with their `%% step` comments, and the props of
  code blocks.
- Knows the syntax of decks, so `{#id}` and `$x^{2}$` aren't errors, while
  actual syntax errors are reported where they are.
- Provides hover, go to definition, completion, and rename in the JavaScript
  of decks, and the outline of their headings.
- Previews the open deck next to its editor, updating it as you save, and
  presents it, with the buttons in the title bar of its editor or the commands
  starting with `Seminar:`. They run `seminar`, so `@seminar/cli` has to be
  installed in the project of the deck, and Node has to be on the `PATH`.

## Installing

Build the package from the root of the repository and install it:

```sh
npm run vscode:package
codium --install-extension packages/vscode/dist/seminar.vsix
```

Use `code` for VS Code. Reload the window afterwards.

## Good to know

Decks have their own language, `Seminar Deck`, so that the MDX extension
doesn't report errors in them. Settings and extensions for the `mdx` language
don't apply to decks. Prettier needs to be told about them:

```json
{ "prettier.documentSelectors": ["**/*.deck.mdx"] }
```

`$` starts math if `@seminar/plugin-mathjax` is installed for the deck, since
reading the configs of decks would run code of the workspace. Other plugins that
add syntax to the compiler aren't supported yet. The grammar doesn't check this,
so it always highlights `$…$` as math, and only on a single line.

Set `"mdx": { "checkMdx": true }` in `tsconfig.json` to report type errors in
the JavaScript of decks.

Step behaviors, like `only` in `::Box{only}` or `%% step only`, are colored with
semantic tokens, which are turned on for decks. Behaviors from
`StepBehaviorOverrides` are recognized if the augmentation is part of the
TypeScript project of the deck.

## Previewing

The `Seminar: Preview Deck` command and its button show the deck in the panel
or the window that `seminar.preview.location` chooses. The commands
`Seminar: Preview Deck in the Editor` and `Seminar: Preview Deck in a Window`
choose it themselves.

- `editor`, the default, shows it in a panel. Panels can't open windows, go full
  screen, or print, so P fills the panel with the slides, and Shift+P shows the
  presenter view without an audience window. While the deck has the focus, it
  gets the keys, including most shortcuts of the editor.
- `window` opens it in the app of `seminar preview`, with all of its features.

Previews follow the cursor to the slide that it's on, keeping the step of the
slide. Editors scroll to the slide that a preview goes to, and highlight its
start, without moving the cursor. `seminar.preview.sync` turns either off, or
both.

Previews in a project share a dev server, which stops a minute after the last
preview closes. Build errors, and the errors and warnings of the pages of decks,
are in the `Seminar Dev Server` output channel, which opens with the first of
them, or with the `Seminar: Show Dev Server Output` command.

In remote workspaces, the dev server runs on the remote machine, with its port
forwarded to the editor. A preview in a window opens in your browser instead of
the app, and the button to present isn't shown, since the app would run on the
remote machine. In editors running in a browser, the dev server has to answer
requests for any host name, which turns off the protection of Vite against DNS
rebinding. Remote workspaces haven't been tested yet.

## Colors

Themes don't know about decks, so the syntax uses the common scopes of programming
languages for its colors. Every token also has a scope of its own, which takes
precedence, for themes and for `editor.tokenColorCustomizations`:

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
