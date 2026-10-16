# Authoring components

Decks can use any React component, but components that know about slides
work better: they keep their state when the slide is shown again, reveal
themselves in steps, point at other elements, and follow the theme. These
pages describe the API of `@slider/core` for writing them.

Components reach decks in three ways:

- A deck imports them, e.g., `import { Chart } from './Chart.tsx'`, and uses
  them as JSX.
- A plugin or theme maps a [directive](directives.md) to them, e.g.,
  `:::column` to `Column`.
- A theme uses them as [masters](themes.md#masters), which lay out slides.

The pages:

1. [Components on slides](components.md): slide state, views, input,
   sizes, and naming and measuring elements.
2. [Steps in components](steps.md): wrapping content in steps, and reacting
   to the steps of the slide.
3. [Directives and plugins](directives.md): making components available as
   Markdown directives.
4. [Themes](themes.md): masters, styling components, and step behaviors.

## Guidelines

In short, a well-behaved slide component:

- **Renders the same in every view.** A slide is rendered several times at
  once, e.g., for the audience, in the presenter view, and in thumbnails.
  Keep state that should be shared in `useSlideState`, not `useState`.
- **Doesn't use global ids.** Use the names of the slide, e.g.,
  `useSlideElementId`, so that several renderings of a slide don't clash.
- **Measures in slide pixels.** Slides are 1280 × 720 logical pixels,
  scaled to fit the screen. Use `useSlideBox`, rather than
  `getBoundingClientRect`, to measure elements.
- **Takes part in steps through `Step`.** Wrap content in `Step` with a
  `defaultAttachment`, rather than reimplementing placement, so that `:step`
  attributes work on it.
- **Accepts strings for every prop that a directive may set.** Directive
  attributes are strings, and bare flags are empty strings.
- **Can be themed.** Read props with `useThemeProps`, use styled slots with
  classes, and register the component name with the MUI theme.
- **Does heavy work in one view.** The interactive view owns expensive state,
  like a simulation, and shares its results through slide state, while the
  audience window still renders in full. Thumbnails can be lighter.
