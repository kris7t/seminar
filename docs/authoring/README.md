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
3. [Directives](directives.md): making components available as directives.
4. [Plugins](plugins.md): configs, options, and compiler plugins.
5. [Themes](themes.md): masters, styling components, and step behaviors.

## Guidelines

A good slide component follows these rules:

- **Keep shared state in `useSlideState`.** Each slide is rendered several
  times at once: for the audience, in the presenter view, and as thumbnails.
  With `useState`, each copy would have its own state.
- **Don't use global ids.** Several copies of a slide can be on the page at
  once. Get ids from `useSlideElementId`.
- **Measure in slide pixels.** Slides are 1280 × 720 pixels, scaled to fit
  the screen. Use `useSlideBox` instead of `getBoundingClientRect`.
- **Be ready before the slide is shown.** Measure in layout effects or with
  `useMeasure`. While loading, hold the change with `useTransitionHold`. See
  [Waiting until the slide is ready](components.md#waiting-until-the-slide-is-ready).
- **Use `Step` for steps.** Wrap the component in a `Step`, and set where it
  goes with `defaultAttachment`. Then `:step` attributes work on it.
- **Accept strings for props that a directive may set.** Directive
  attributes are always strings, and a bare flag is an empty string.
- **Make it themeable.** Read props with `useThemeProps`, and build its
  parts with `styled`. See [Theming components](themes.md#theming-components).
- **Animate from the current step.** Don't fade steps yourself, since the
  slide already fades. See [Animations](steps.md#animations).
- **Do heavy work in one view.** Run expensive work, like a simulation, only
  in the interactive view, and share the results through slide state.
