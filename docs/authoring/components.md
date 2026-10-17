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
[slide state](#slide-state), which the other views render.

`useSlideView` also has flags for common checks:

- `presented`: the slide is being presented, in the `audience` or
  `presenter` view, so it should render in full fidelity. Thumbnails,
  previews, and probes can render a lighter version.
- `visible`: the view is shown, i.e., it isn't a `probe`, which only needs
  the steps of the slide, so that expensive set-up, like connections or
  timers, can be left out.
- `animated`: the slide is presented, and the viewer doesn't prefer reduced
  motion, so that animations should play, see
  [Animations](steps.md#animations).

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

## Waiting until the slide is ready

When the slide or its step changes, the audience and presenter views keep
showing the old slide until the new one is ready. Then they cut or fade to
it. This way, viewers don't see a half-finished layout.

The new slide is ready when:

- React has finished rendering, including renders started by effects,
- its images and fonts have loaded, and
- no component holds the change.

The views wait at most 150 ms (`SETTLE_DEADLINE`), and show the change in
both views at the same time. CSS transitions and animations that the change
started run from the start once it's shown, so they don't play out unseen
while the views wait. Browsers without view transitions change the
slide at once.

### Holding the change

Call `useTransitionHold(pending)` while a component isn't ready, e.g., while
it loads data:

```tsx
import { useTransitionHold } from '@slider/core';

export function Plot({ src }: { src: string }) {
  const data = useData(src);
  useTransitionHold(data === undefined, { deadline: 500 });
  return data === undefined ? null : <Chart data={data} />;
}
```

- `deadline` is how long the change may wait, in milliseconds. Without it,
  the change waits at most 150 ms. If several components hold the change,
  the longest deadline wins, up to a few seconds.
- A hold only delays changes that happen while it's pending. A component
  that never finishes loading delays one change, not every step after it.

### Measuring

Measure in layout effects, not in effects: layout effects run before the
change is shown.

To measure again when an element resizes, use `useMeasure(element, measure)`
instead of a `ResizeObserver` of your own. Some browsers don't run resize
observers while the views wait, but `useMeasure` measures then, too. In
`measure`, only set state if the value changed.

## Positioning

`useSlideBox(target)` measures an element, or the element with a name, in
logical slide pixels from the top left corner of the slide, whatever the
scale of the view. It measures again when the element or the window is
resized, like `useMeasure`, and returns `undefined` until the element is
measured.

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
