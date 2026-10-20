# Using elements

`@seminar/elements` adds presentation elements, like callouts and columns, to
decks. In Markdown, they're written as [directives](../README.md#syntax-at-a-glance),
e.g., `:::column`.

Enable the package as a plugin of Seminar, e.g., in `vite.config.ts`:

```ts
seminar({ plugins: ['@seminar/elements'] });
```

Each element is also a React component, which can be used in JSX or in other
components, e.g., `<Callout anchor="arch">…</Callout>`.

Elements take part in [steps](../core/steps.md) like other content, and take
the attributes of `:step`, like `step`, `group`, `in`, and behaviors like
`only`. Themes can set their defaults and styles through the `components` of
the MUI theme, e.g., `SeminarCallout`.

- [Callouts](callouts.md) point at text, images, or other elements.
- [Columns](columns.md) lay out content side by side.
