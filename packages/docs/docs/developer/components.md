---
sidebar_position: 2
---

# Components on slides

## Slide state

A slide is rendered in several views: for the audience, in the presenter
view, in previews, and as a thumbnail. Each rendering mounts its own
components, so `useState` would give each view its own state, and lose it
when the slide is left.

`useSlideState` is like `useState`, but the state belongs to the slide:

```tsx
import { useResetSlideState, useSlideState } from '@seminar/core';

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
`useResetSlideState` resets every non-transient state of the slide to its
initial value.

States are told apart by the order in which the components of the slide
first render. Pass a `key`, e.g., `useSlideState(0, { key: 'count' })`, for
components that mount later, e.g., when a tab is selected. `SlideStateNamespace`
gives the states inside it a namespace of their own, e.g., to render a component
with a fixed key several times on a slide. Components mounted at the same time
need different keys or namespaces: they share their state otherwise, which logs
a warning. It throws if their initial values differ, if one of them is
transient, or if two namespaces have the same id. Initial values that aren't
plain data, e.g., media streams, can't be compared, so they only warn.

This makes `useSlideState` a drop-in replacement for `useState` in simple
components. Components that mount conditionally, or that share state with
other components, should define a [store](#stores) instead.

The state can be any value, including objects that only exist while the deck
runs, like a media stream that one view creates for the others.

For internal values used only to mirror a component between views, pass
`transient: true`:

```tsx
const [mirroredValue, setMirroredValue] = useSlideState('', {
  transient: true,
});
```

Transient state is shared between views for the current visit and starts
over when the presenter returns to the slide. Steps, the overview, and
opening or closing the presenter view keep the current visit's values.
Transient state doesn't add a state marker or reset button to the slide,
and updating it doesn't mark the slide or deck as changed. Reset slide
leaves it alone; Reset deck clears it.

## Stores

A store is typed state that you define once, outside of components, and read
with `useStore`. The definition identifies the state, so every component
that imports it shares the same values, and they can't collide with the
state of other components.

`defineSlideStore` defines state that belongs to each slide, like
`useSlideState`, and `defineDeckStore` defines state that every slide shares,
like an answer that the audience gives on one slide and that a later slide
shows:

```tsx
import { defineDeckStore, useStore } from '@seminar/core';

const vote = defineDeckStore<'yes' | 'no'>();

export function Vote() {
  const [value, setValue] = useStore(vote);
  return <button onClick={() => setValue('yes')}>{value ?? 'No vote'}</button>;
}
```

Without an `initial` function, values are `undefined` until they are set.
Stores hold a value for each key, which `initial` receives. The type of its
parameter is the type of the keys, and `useStore` requires a key unless that
type allows `undefined`:

```tsx
const answers = defineDeckStore({
  initial: (question: string) => '',
});

const [answer, setAnswer] = useStore(answers, { key: 'favorite-color' });
```

Keys that are plain objects or arrays are compared by their contents, other
objects by identity.

With a `reduce` function, `useStore` returns a function that dispatches
actions to it instead of a setter, like `useReducer`:

```tsx
const poll = defineDeckStore({
  initial: () => ({ yes: 0, no: 0 }),
  reduce: (votes, vote: 'yes' | 'no') => ({
    ...votes,
    [vote]: votes[vote] + 1,
  }),
});

const [yes, vote] = useStore(poll, { select: (votes) => votes.yes });
```

`select` picks the part of the value that the component shows, so that it
only renders again if that part changes.

When a module changes in the dev server of `@seminar/vite-plugin`, its stores
keep their values, unless their variables are renamed, or their `initial`
functions change, so that editing the initial value shows it.

Values of slide stores are kept like those of `useSlideState`, and pass
`transient: true` to `defineSlideStore` for transient values. Reset slide
resets the slide stores of the slide, and Reset deck in the menu resets
every store and all slide state, including transient values. It also resets
every slide and recap to the first step of its own range, and shows the
first non-spare slide (or the first slide if all are spare).

## Errors

A slide that throws an error while rendering shows the error in its place,
in the audience window, too, while the rest of the deck keeps working. It's
rendered again when the presenter comes back to it, or when its code changes
in the dev server. When printing, it is left out instead.

## Views

`useSlideView` tells which rendering a component is in. Its `kind` is one of:

- `presenter`: the slide in the presenter view, while presenting,
- `audience`: the slide shown to the audience, either in the deck window when
  not presenting, or in the audience window,
- `thumbnail`: a small rendering of the slide for the overview,
- `preview`: the previews of the next step and slide,
- `print`: a page with the slide at a step, when printing the deck, and
- `probe`: an invisible rendering that finds the steps of a slide.

`interactive` is `true` in the one view that the presenter interacts with:
the deck window, which is the presenter view while presenting. The audience
window is a mirror that isn't interactive, but the audience looks at it, so
components must render there in full fidelity.

Heavy state, like a running simulation, a video, or a camera stream, should
be owned by the interactive view: it runs the work and keeps the results in
[slide state](#slide-state), which the other views render.

`useSlideView` also has flags for common checks:

- `mirrorPointer`: the presenter's pointer, hover, focus, and caret are mirrored
  between the presenter and audience views. It is false when not presenting,
  in laser pointer mode, and in other views.
- `presented`: the slide is being presented, in the `audience` or
  `presenter` view, so it should render in full fidelity. Thumbnails,
  previews, and probes can render a lighter version.
- `visible`: the view is shown, i.e., it isn't a `probe`, which only needs
  the steps of the slide, so that expensive set-up, like connections or
  timers, can be left out.
- `animated`: the slide is presented, and the viewer doesn't prefer reduced
  motion, so that animations should play, see
  [Animations](steps.md#animations).

Components that virtualize inputs can use `interactive || mirrorPointer` to
render matching controls in the audience window while mirroring is enabled.
The audience window remains inert; the presenter view handles input.

## Shared resources and cached work

`defineResource` and `defineCache` describe work shared by every slide and
view in a Deck. Define them outside components. Defining them doesn't load
anything; each Deck owns its instances and results, independently of slide
state and its reset buttons.

A resource is something acquired once, like a rendering engine, that may
need cleanup. A cache computes reusable values from arguments, optionally
using resources:

```tsx
import { defineCache, defineResource, useCached } from '@seminar/core';

const engine = defineResource({
  load: async () => {
    const { createEngine } = await import('./engine.ts');
    return createEngine();
  },
  dispose: (engine) => engine.dispose(),
  transitionHold: 1000,
});

const renderedText = defineCache(
  (args: { text: string }, { engine }) => engine.render(args.text),
  {
    resources: { engine },
    transitionHold: 1000,
    maxUnusedEntries: 8,
  },
);

export function RenderedText({ text }: { text: string }) {
  const result = useCached(renderedText, { text });
  if (result.status === 'error') return <span>Cannot render text</span>;
  return <span>{result.value}</span>;
}
```

`useResource(engine)` acquires a resource directly. Both hooks require a
Deck and return `{ status, pending, value, error }`. The status is `pending`,
`success`, or `error`; `value` is available on success. Work starts after
commit, and identical requests share their pending work as well as results.
Changing arguments requests a new result, with `value` undefined while it
is pending.

Cache arguments are compared structurally for plain objects and arrays,
including object properties regardless of their order. Other objects and
functions are compared by identity. A cache can provide `key: (args) => …`
to derive a key instead. Cyclic data requires a custom key. All changing
inputs must participate in the key. Injected resource instances are kept
separately and never normalized into argument keys.

By default, caches have `enabled: 'visible'`: probes load their resources
in the background, but leave computation for a visible view. Set
`enabled: 'always'` to compute in probes too. Probes never hold transitions.

Both definitions accept `transitionHold`: `true`, the default, uses the
normal transition deadline; a number sets the deadline in milliseconds;
and `false` disables the hold. Injected resources keep their own hold
settings. The deadline limits how long a transition waits, and doesn't
cancel the work.

Resources stay loaded until the Deck unmounts. Their optional `dispose`
function may be async and runs after outstanding computations using them
finish. Acquisitions that finish after unmount are also disposed.

Cache results remain available while any view of a slide that used them is
rendered, including across step changes. Each cache also keeps the complete
working sets of its two most recently unmounted slides, even if a slide
uses hundreds of entries. This lets a slide remount or switch views without
recomputing most of its content. `maxUnusedSlides` changes this history
limit; `0` disables it, and `Infinity` retains every slide's results.

Outside these working sets, the cache retains up to `maxUnusedEntries`
individual results in least-recently-used order, defaulting to 8. Set it to
`0` to evict these extra entries promptly, or `Infinity` to retain all
results until the Deck unmounts. Set both limits to `0` to evict results
once their last view leaves. Pending work remains shareable until it
finishes. Evicting results doesn't dispose resources.

## Input

Clicks on a slide, and keys like Space and the arrow keys, go to the next or
previous step. Interactive elements take precedence for the input they use:

- text fields take all navigation keys,
- widgets like sliders, tabs, and menus take the arrow keys, Home, End, Page
  Up, and Page Down,
- links and buttons take Space and Enter, and clicks.

Clicks on these elements don't change steps. Mark other elements that handle
all input themselves, e.g., a canvas, with the `data-seminar-interactive`
attribute (`INTERACTIVE_ATTRIBUTE`).

## Sizes

Slides are `SLIDE_WIDTH` × `SLIDE_HEIGHT`, i.e., 1280 × 720, logical pixels,
scaled to fit the screen, or a thumbnail. Sizes in CSS pixels are logical
pixels, so components can lay out in pixels, and stay sharp at any scale.

Don't use `rem` on slides. In Safari and other WebKit browsers, slides are
scaled with `zoom`, which doesn't scale `rem`. Use `px` or `em` instead.
MUI components are fine: the slide theme sizes them in pixels.

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
- `useSlideElementRegistry()` returns a function that names an element that
  the component doesn't render itself, like a node of a diagram, until the
  function that it returns is called. With `{ group }`, the element is also
  in the step of that step group, even if it isn't inside its elements, so
  that callouts pointing at it come in that step.

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
import { useTransitionHold } from '@seminar/core';

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

### Updating the slide

Changes of the slide or its step wait for it to be ready, but other updates,
e.g., of the state of a component when it's clicked, show at once. To make
an update wait, too, run it with the function that `useSlideUpdate()`
returns:

```tsx
import { useSlideUpdate } from '@seminar/core';

export function Reveal() {
  const [shown, setShown] = useState(false);
  const updateSlide = useSlideUpdate();
  return shown ? (
    <Plot src="data.csv" />
  ) : (
    <Button onClick={() => updateSlide(() => setShown(true))}>Show</Button>
  );
}
```

The views keep showing the slide as it was until `Plot` stops holding the
change, and then cut to it, in both views at the same time.

- The update may run a moment later, but before any later update or change
  of the slide.
- An update cuts short the change before it, if it's still waiting or
  fading. Set state as usual for updates that come quickly one after
  another, e.g., while typing or dragging.
- Browsers without view transitions update the slide at once.

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
import { useSlideBox, useSlidePoint, type SlidePoint } from '@seminar/core';
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
