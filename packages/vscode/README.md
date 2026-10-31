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

## Developing

`syntaxes/source.mdx.tmLanguage` is an unmodified copy of the
[grammar of MDX](https://github.com/wooorm/markdown-tm-language), used under
the MIT license in `syntaxes/LICENSE.source.mdx.txt`. Replace it to update the
grammar. `renderDeckGrammar` in `src/grammar.ts` turns it into the grammar of decks
when building. The grammar of Mermaid comes from `@shikijs/langs`, also when building. The rest of the syntax is injected by the grammars next
to it, which include the grammar of TeX that comes with the editor.
