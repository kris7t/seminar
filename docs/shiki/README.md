# Highlighting code

`@slider/plugin-shiki` highlights the code blocks of decks with
[Shiki](https://shiki.style), which uses the grammars and the themes of VS
Code. Code is highlighted when the deck is compiled, so the deck contains
only the highlighted code, but no highlighter, grammars, or scripts.

## Enabling the plugin

Add the package to the dependencies of the project, and enable it as a
plugin of slider, e.g., in `vite.config.ts`:

```ts
slider({ plugins: ['@slider/plugin-shiki'] });
```

## Code blocks

Write the language after the opening fence:

````mdx
```ts
export function fibonacci(n: number): number {
  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
}
```
````

Shiki knows [many languages](https://shiki.style/languages) by their names
and aliases, e.g., `ts`, `python`, or `elixir`. Blocks without a language,
or in `text`, are shown without highlighting. Blocks in a language that
Shiki doesn't know are shown without highlighting, too, with a warning when
compiling the deck.

Code blocks are shown with the step before them, like paragraphs. The
opening fence takes the attributes of `:step` after the language, e.g., an
id, classes, and `step` to show the block in a step of its own:

````mdx
```ts #fib .wide step group=impl
fibonacci(10);
```
````

Clicking a code block goes to the next step, like clicking text.

## Themes

Code blocks are highlighted with the `github-light` theme by default. The
`code` key of the frontmatter selects another
[theme of Shiki](https://shiki.style/themes):

```yaml
code:
  theme: github-dark
```

The theme of the presentation can select one for all of its decks, in the
`options` of its config:

```ts
import type { SliderConfig } from '@slider/core';

export const slider: SliderConfig = {
  options: { code: { theme: 'github-light-high-contrast' } },
};
```

The frontmatter of a deck takes precedence over the theme of the
presentation.

## Other languages and themes

`languages` and `themes` in the `code` options load more grammars and
themes from JSON files, e.g., from extensions of VS Code:

```ts
export const slider: SliderConfig = {
  options: {
    code: {
      theme: 'Course Light',
      languages: ['./grammars/prolog.tmLanguage.json'],
      themes: ['./themes/course-light.json'],
    },
  },
};
```

- Grammars are [TextMate grammars](https://macromates.com/manual/en/language_grammars)
  in JSON, with a `scopeName`. The language is called by the `name` of the
  grammar.
- Themes are themes of VS Code in JSON. The theme is called by its `name`,
  which `theme` selects.

To call a language or a theme by another name, give the file as an object,
e.g., `{ path: './prolog.json', name: 'prolog', aliases: ['pl'] }`, where
`aliases` are further names of a language.

Relative paths are resolved from the file that lists them: the module of
the theme of the presentation, or the deck for the frontmatter. Other paths
are resolved as files of packages, e.g., `some-grammars/prolog.json`.

Unlike `theme`, which the frontmatter overrides, the `languages` and
`themes` of the plugins, the theme of the presentation, and the frontmatter
add up. Files that can't be read are reported when compiling the deck.

Changes to these files apply when the deck is compiled again, e.g., after
editing the deck.

## Styling

The code blocks are `Code` components, which the MUI theme of the slides can
style as `SliderCode`, e.g., to change their font:

```ts
createSlideTheme({
  components: {
    SliderCode: {
      styleOverrides: {
        root: {
          '& pre': { fontFamily: '"JetBrains Mono", monospace' },
        },
      },
    },
  },
});
```

The code is in a `pre` element in the component, with the background and
text colors of the highlighting theme. By default, it uses the monospace
font of the system, at three quarters of the size of the text around it.
