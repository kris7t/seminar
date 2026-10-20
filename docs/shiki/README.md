# Highlighting code

`@seminar/plugin-shiki` highlights code blocks with
[Shiki](https://shiki.style). Shiki uses the grammars and themes of VS Code.

The code is highlighted when the deck is compiled. The deck only contains
the result, not the highlighter.

## Enabling the plugin

Add `@seminar/plugin-shiki` to the dependencies of your project. Then list it
in the plugins in `vite.config.ts`:

```ts
seminar({ plugins: ['@seminar/plugin-shiki'] });
```

## Writing code blocks

Write the language after the opening fence:

````mdx
```ts
export function fibonacci(n: number): number {
  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
}
```
````

Shiki knows [many languages](https://shiki.style/languages).

Code without a language is not highlighted. Neither is code in a language
that Shiki doesn't know. You get a warning for those.

A code block appears with the step before it, like a paragraph. To change
that, write the attributes of `:step` after the language:

````mdx
```ts #fib .wide step group=impl
fibonacci(10);
```
````

## Choosing a theme

The default theme is `github-light`. To choose another
[theme of Shiki](https://shiki.style/themes) for a deck, set it in the
frontmatter:

```yaml
code:
  theme: github-dark
```

To choose a theme for every deck, set it in the config of your presentation
theme:

```ts
export const seminar: SeminarConfig = {
  options: { code: { theme: 'github-dark' } },
};
```

The frontmatter wins over the presentation theme.

## Adding languages and themes

You can load more languages and themes from JSON files. List them in
`languages` and `themes`:

```ts
export const seminar: SeminarConfig = {
  options: {
    code: {
      languages: ['./grammars/prolog.tmLanguage.json'],
      themes: ['./themes/course-light.json'],
      theme: 'Course Light',
    },
  },
};
```

Languages are
[TextMate grammars](https://macromates.com/manual/en/language_grammars).
Themes are VS Code themes. Both are called by the `name` in their file.

To use another name, write an object instead of the path:

```ts
languages: [{ path: './prolog.json', name: 'prolog', aliases: ['pl'] }];
```

Paths starting with `.` are relative to the file that lists them. Other
paths are looked up in packages.

The frontmatter can list files, too. They are added to those of the
presentation theme.

The files are read when a deck is compiled. If you change one, edit the deck
to see the change.

### Embedding languages

A grammar can include the languages of Shiki by their scope:

```json
{ "include": "source.ts" }
```

The plugin then loads TypeScript, too.

### Replacing languages

The languages and themes you add come in addition to those of Shiki. To
replace a language of Shiki, give your grammar its name.

## Styling code blocks

Code blocks are `Code` components. Style them as `SeminarCode` in the MUI
theme of your slides:

```ts
createSlideTheme({
  components: {
    SeminarCode: {
      styleOverrides: {
        root: {
          '& pre': { fontFamily: '"JetBrains Mono", monospace' },
        },
      },
    },
  },
});
```

By default, code uses the monospace font of the system. It is three quarters
of the size of the text. The background and text colors come from the
highlighting theme.
