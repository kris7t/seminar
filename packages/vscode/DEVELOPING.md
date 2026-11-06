# Developing the extension

`README.md` is the page of the extension on the Visual Studio Marketplace and
Open VSX, so notes for developing it are here.

## Installing from source

Build the package from the root of the repository and install it:

```sh
npm run vscode:package
codium --install-extension packages/vscode/dist/seminar.vsix
```

Use `code` for VS Code. Reload the window afterwards.

## Grammars

`syntaxes/source.mdx.tmLanguage` is an unmodified copy of the
[grammar of MDX](https://github.com/wooorm/markdown-tm-language), used under
the MIT license in `syntaxes/LICENSE.source.mdx.txt`. Replace it to update the
grammar. `renderDeckGrammar` in `src/grammar.ts` turns it into the grammar of
decks when building. The grammar of Mermaid comes from `@shikijs/langs`, also
when building. The rest of the syntax is injected by the grammars next to it,
which include the grammar of TeX that comes with the editor.

## Icon

`assets/icon.png` is rendered from `icon.svg`:

```sh
rsvg-convert -w 256 -h 256 -o assets/icon.png icon.svg
```

## Releasing

The extension is released with the libraries, see `RELEASING.md` at the root
of the repository.
