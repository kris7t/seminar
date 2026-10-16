# Components on slides

## Slide state

A slide is rendered in several views at once: for the audience, in the
presenter view, and as thumbnails in the overview and the previews. Each
rendering mounts its own components, so `useState` would give each view its
own state, and lose it when the slide is left.

`useSlideState` is like `useState`, but the state belongs to the slide:

```tsx
import { useResetSlideState, useSlideState } from '@slider/core';

export function Counter() {
  const [count, setCount] = useSlideState(0);
  const reset = useResetSlideState();
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <button onClick={reset}>Reset</button>
    </>
  );
}
```

Every view of the slide shows the same count, and it's kept when the
presenter comes back to the slide, or shows it again in a recap.
`useResetSlideState` resets every state of the slide to its initial value.

States are told apart by the order in which the components of the slide
first render. Pass a `key`, e.g., `useSlideState(0, { key: 'count' })`, for
components that mount later, e.g., when a tab is selected. `SlideStateScope`
gives the states inside it a namespace of their own, e.g., in components rendered
several times, or that mount after the slide.

The state can be any value, including objects that only exist while the deck
runs, like a media stream that one view creates for the others.

## Views

`useSlideView` tells which rendering a component is in. Its `kind` is one of:

- `presenter`: the slide in the presenter view, while presenting,
- `audience`: the slide shown to the audience, either in the deck window when
  not presenting, or in the audience window,
- `thumbnail` and `preview`: the overview and the previews of the next step
  and slide, and
- `probe`: an invisible rendering that finds the steps of a slide.

`interactive` is `true` in the one view that the presenter interacts with:
the deck window, which is the presenter view while presenting. The audience
window is a mirror that isn't interactive, but the audience looks at it, so
components must render there in full fidelity.

Heavy state, like a running simulation, a video, or a camera stream, should
be owned by the interactive view: it runs the work and keeps the results in
[slide state](#slide-state), which the other views render. Thumbnails,
previews, and probes can render a lighter version, judged by `kind`.

## Input

Clicks on a slide, and keys like Space and the arrow keys, go to the next or
previous step. Interactive elements take precedence for the input they use:

- text fields take all navigation keys,
- widgets like sliders, tabs, and menus take the arrow keys, Home, End, Page
  Up, and Page Down,
- links and buttons take Space and Enter, and clicks.

Clicks on these elements don't change steps. Mark other elements that handle
all input themselves, e.g., a canvas, with the `data-slider-interactive`
attribute (`INTERACTIVE_ATTRIBUTE`).

## Sizes

Slides are `SLIDE_WIDTH` × `SLIDE_HEIGHT`, i.e., 1280 × 720, logical pixels,
scaled to fit the screen, or a thumbnail. Sizes in CSS pixels are logical
pixels, so components can lay out in pixels, and stay sharp at any scale.

## Naming elements

The same slide can be rendered several times on a page, so ids on it must be
unique for each rendering. Components refer to elements by names, which are
unique on their slide:

- `useSlideElementId(name)` returns an id for the element called `name`,
  unique in the page, e.g., for `aria-labelledby` or SVG references.
- `useSlideElementRef(name)` returns a ref that makes an element the element
  called `name`, and warns if there are several.
- `useSlideElement(target)` returns the element called `target` in the same
  rendering of the slide, once it's rendered, or `target` itself if it's an
  element. Components can thus take either an element or its name, e.g., in
  an `anchor` prop.
- `<SlideElement name="arch" component="img" …>` renders an element with a
  name. MDX turns elements with an `id`, like `<img id="arch">`, into these.

In MDX, components get the name of `#name` or `id=name` as their `id` prop,
so they should pass it on to `useSlideElementRef`, `SlideElement`, or a
`Step`, which names its element.

## Positioning

`useSlideBox(target)` measures an element, or the element with a name, in
logical slide pixels from the top left corner of the slide, whatever the
scale of the view. It measures again when the element or the window is
resized, and returns `undefined` until the element is measured.

`useSlidePoint(target, { at, shift })` returns a point in the box of an
element, or of the slide without a target, e.g., for an arrow pointing at a
part of an image. Points are `SlidePoint`s, which can be written in MDX:
`x,y` in logical pixels, like `120,80`, or percentages of the box, like
`62%,40%`. `parseSlidePoint` and `resolveSlidePoint` work with them
directly.

To draw at the point, measure where the component itself is, e.g., with a
zero-size element, and place the drawing relative to it, which is what
callouts do:

```tsx
import { useSlideBox, useSlidePoint, type SlidePoint } from '@slider/core';
import { useState } from 'react';

export function Marker({ for: target, at }: { for?: string; at?: SlidePoint }) {
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const originBox = useSlideBox(origin ?? undefined);
  const position = useSlidePoint(target, { at });
  const [x, y] = position?.point ?? [0, 0];
  return (
    <span ref={setOrigin} style={{ position: 'relative' }}>
      {position !== undefined && originBox !== undefined && (
        <span
          style={{
            position: 'absolute',
            left: x - originBox.x - 12,
            top: y - originBox.y - 12,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'red',
          }}
        />
      )}
    </span>
  );
}
```
