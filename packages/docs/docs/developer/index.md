---
sidebar_position: 1
sidebar_label: Overview
---

# Developers

Build React components, plugins, and themes that extend Seminar. For writing
and presenting decks with existing components, start with the
[User guide](../guide/index.md).

Decks can use any React component. The APIs in `@seminar/core` let components
keep state between visits, reveal content in steps, point at other elements,
and follow the theme.

Components reach decks in three ways:

- A deck imports them, e.g., `import { Chart } from './Chart.tsx'`, and uses
  them as JSX.
- A plugin or theme maps a [directive](directives.md) to them, e.g.,
  `:::column` to `Column`.
- A theme uses them as [masters](themes.md#masters), which lay out slides.

## Features

- [Components on slides](components.md): share state and handle user input.
- [Steps in components](steps.md): reveal and animate content as the talk
  progresses.
- [Directives](directives.md): use your components in Markdown.
- [Plugins](plugins.md): bundle components and extend the deck compiler.
- [Themes](themes.md): customize slide layouts, styling, and transitions.

## Guidelines

A good slide component follows these rules:

- **Keep shared state in `useSlideState`.** Each slide is rendered several
  times: for the audience, in the presenter view, and as thumbnails.
  With `useState`, each copy would have its own state.
- **Don't use global ids.** Several copies of a slide can be on the page at
  once. Get ids from `useSlideElementId`.
- **Measure in slide pixels.** Slides are 1280 × 720 pixels, scaled to fit
  the screen. Use `useSlideBox` instead of `getBoundingClientRect`.
- **Be ready before the slide is shown.** Measure in layout effects or with
  `useMeasure`. While loading, hold the change with `useTransitionHold`.
  Make updates on click wait, too, with `useSlideUpdate`. See
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
