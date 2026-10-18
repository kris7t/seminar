# Directives

A plugin or a theme can make components available as Markdown
[directives](../README.md#syntax-at-a-glance), so that decks don't have to
import them. `@slider/elements` is a plugin like this.

## Registering directives

List the directives in the `directives` key of the
[config of the plugin](plugins.md#the-config):

```json
{
  "name": "my-elements",
  "slider": {
    "directives": {
      "note": {
        "source": "my-elements",
        "exportName": "Note",
        "formProp": "directive",
        "labelProp": "heading"
      }
    }
  }
}
```

Decks can use `:::note` once the plugin is enabled.

Decks import `source` as it's written. So it should be the name of a
package, not a relative path, which would be relative to each deck.

The components run in the browser, like any other component.

If several configs register the same directive, the last one wins. So a
theme can replace the components of plugins.

## Props from directives

A directive turns into its component with these props:

- Each attribute becomes a prop of the same name. `#name` becomes `id`, and
  `.class` becomes `className`.
- The content becomes the `children`. That's the label of a text or leaf
  directive, like `Hello` in `:note[Hello]`, or the Markdown inside a
  container.
- With `formProp`, the component learns how the directive was written:
  `text` for `:note`, `leaf` for `::note`, and `container` for `:::note`.
  Use it to choose defaults, like laying out blocks rather than text.
- With `labelProp`, the label of a container, `:::note[Title]`, goes to that
  prop as plain text. Otherwise, it's the first paragraph of the children.

Attribute values are always strings. Bare flags like `{step}` are empty
strings. So props that a directive may set should accept strings: numbers
like `width` as `number | string`, and flags as `boolean | ''`, where `''`
means `true`.

## Wrapping consecutive directives

`wrapIn` wraps consecutive directives of this kind in a container directive,
unless they're directly in one already.

`@slider/elements` registers `column` with `"wrapIn": "columns"`. So
consecutive `:::column`s don't need a `::::columns` around them. The wrapper
has no attributes. To set them, write the wrapper explicitly.

## Guidelines

- **Keep directive components thin.** Map the directive to a component with
  a clean JSX API, like `CalloutDirective` does for `Callout`. Keep Markdown
  details out of the component itself.
- **Pass the other props on to a `Step`.** Then `:step` attributes work on
  the directive. See [Steps in components](steps.md).
- **Use short, lowercase names.** Name it like the HTML element it stands
  for, like `column`, and its wrapper in the plural, like `columns`.
