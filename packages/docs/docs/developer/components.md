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
import { useSlideState } from '@seminar/core';

export function Counter() {
  const [count, setCount] = useSlideState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

Every view of the slide shows the same count. It's kept when the presenter
comes back to the slide, or shows it again in a recap.

`useSlideState` needs to be inside a slide of a `Deck`. It suits simple
components. For anything more, define a [store](#stores).

### Keys

States are told apart by the order in which the components of a slide first
render. A component that mounts later, e.g., when a tab is selected, needs a
key:

```tsx
const [count, setCount] = useSlideState(0, { key: 'count' });
```

Never use the same key twice on a slide, because the components would overwrite
each other's state. If a component with a key appears several times, wrap each
one in a namespace with its own id:

```tsx
<>
  <SlideStateNamespace id="left">
    <Counter />
  </SlideStateNamespace>
  <SlideStateNamespace id="right">
    <Counter />
  </SlideStateNamespace>
</>
```

### Transient state

Transient state lasts for one visit to the slide. Use it for internal values
that only mirror a component between views:

```tsx
const [text, setText] = useSlideState('', { transient: true });
```

It starts over when the presenter returns to the slide. It stays through
steps, the overview, and opening or closing the presenter view.

Transient state doesn't add a state marker to the slide, and changing it
doesn't mark the slide or the deck as changed.

## Stores

A store is typed state that you define once, outside of components. Every
component that imports the definition shares its values, and no other
component can collide with them.

There are two kinds of stores:

- `defineSlideStore` defines state that belongs to each slide, like
  `useSlideState`.
- `defineDeckStore` defines state that every slide shares, like an answer given
  on one slide and shown on a later one.

Read and set their values with `useStore`:

```tsx
import { defineDeckStore, useStore } from '@seminar/core';

const vote = defineDeckStore<'yes' | 'no'>();

export function Vote() {
  const [value, setValue] = useStore(vote);
  return <button onClick={() => setValue('yes')}>{value ?? 'No vote'}</button>;
}
```

Like `useSlideState`, `useStore` needs to be inside a `Deck`. Slide stores
also need to be inside a slide.

### Initial values

Values are `undefined` until they are set, unless the store has an `initial`
function:

```tsx
const count = defineSlideStore({ initial: () => 0 });
```

### Keys

A store can hold a value for each key. The parameter of `initial` sets the type
of the keys:

```tsx
const answers = defineDeckStore({
  initial: (question: string) => '',
});

const [answer, setAnswer] = useStore(answers, { key: 'favorite-color' });
```

Unlike the keys of `useSlideState`, these can safely be reused: every component
that uses the same key shares the same value. Namespaces don't affect them.

Plain objects and arrays work as keys, and are compared by their contents.
Other objects are compared by identity.

### Reducers

With a `reduce` function, `useStore` returns a function that dispatches actions
instead of a setter, like `useReducer`:

```tsx
const poll = defineDeckStore({
  initial: () => ({ yes: 0, no: 0 }),
  reduce: (votes, vote: 'yes' | 'no') => ({
    ...votes,
    [vote]: votes[vote] + 1,
  }),
});

const [votes, vote] = useStore(poll);
```

### Selecting a part of the value

With `select`, the component only renders again if the selected part changes:

```tsx
const [yes] = useStore(poll, { select: (votes) => votes.yes });
```

### Transient stores

Slide stores can be transient, like [transient state](#transient-state):

```tsx
const text = defineSlideStore({ initial: () => '', transient: true });
```

### Hot reload

Stores keep their values when their module changes in the dev server of
`@seminar/vite-plugin`. A store starts over if its `initial` function changes,
so that you see the new initial value, or if its variable is renamed.

`useSlideState` always keeps its values. Without keys, adding a state above
others can also move their values to the wrong component. Prefer stores for
state that you keep editing.

## Resetting state

`useResetSlideState` returns a function for a reset button on a slide. It resets
all state of the slide, and stays on the current step:

```tsx
const reset = useResetSlideState();
```

The presenter can reset the slide or the whole deck from the menu.

## Errors

A slide that throws an error while rendering shows the error in its place. The
rest of the deck keeps working.

- The audience window leaves out the stack trace.
- The overview shows an icon for the slide.
- Printing leaves out the slide.

The button below the error does the same as Reset slide. The slide also renders
again when the presenter comes back to it.

A slide that fails after its code changed in the dev server resets its state by
itself, since the state may no longer fit the code. It stays on its step, and
only shows the error if it fails again.

## Views

`useSlideView` tells which rendering a component is in. Its `kind` is one of:

- `audience`: the slide shown to the audience. This is the deck window when not
  presenting, and the audience window when presenting.
- `presenter`: the slide in the presenter view.
- `thumbnail`: a small rendering for the overview.
- `preview`: a preview of the next step or slide, or a slide coming into view
  while swiping.
- `print`: a page with the slide at a step, when printing the deck.
- `document`: a static rendering for clients that don't run JavaScript. Effects
  don't run here.
- `probe`: an invisible rendering that finds the steps of a slide.

`interactive` is `true` in the one view that the presenter uses: the deck
window, which is the presenter view while presenting. Run expensive work, like
a simulation, in this view, and keep the results in
[slide state](#slide-state) for the other views to render.

The audience window isn't interactive, but the audience is looking at it, so
components must render there in full.

`useSlideView` also has flags for common checks:

- `presented`: the view is `audience` or `presenter`. Other views can render a
  lighter version.
- `visible`: the view isn't a `probe`. Leave out expensive set-up in probes,
  like connections or timers.
- `animated`: the slide is presented, and the viewer doesn't prefer reduced
  motion. See [Animations](steps.md#animations).
- `mirrorPointer`: the presenter's pointer, hover, focus, and caret are mirrored
  to the audience. It's `false` when not presenting, in laser pointer mode, and
  in other views.

A component that virtualizes its inputs can render matching controls in the
audience window with `interactive || mirrorPointer`. The presenter view still
handles the input.

## Shared resources and cached work

`defineResource` and `defineCache` describe work that every slide and view in a
`Deck` shares. Define them outside of components. Nothing loads until a
component needs it, and each `Deck` has its own instances and results. Resetting
state doesn't affect them.

- A resource is something acquired once, like a rendering engine.
- A cache computes reusable values from arguments, optionally using resources.

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

`useResource(engine)` acquires a resource directly.

### Results

`useCached` and `useResource` need to be inside a `Deck`. They return
`{ status, pending, value, error }`, where `status` is `pending`, `success`, or
`error`.

Work starts after commit, and identical requests share it. When the arguments
change, `value` is `undefined` until the new result is ready.

### Cache keys

Include every input that changes the result in the arguments, or in a key:

```tsx
const renderedText = defineCache(render, {
  key: (args) => args.text,
});
```

Plain objects and arrays are compared by their contents, whatever the order of
their properties. Other objects and functions are compared by identity. Cyclic
data needs a custom key.

### Probes

By default, probes load the resources of a cache, but leave the computation to
a visible view. Set `enabled: 'always'` to compute in probes, too. Probes never
hold transitions.

### Holding transitions

Both definitions take `transitionHold`, which sets how long a transition waits
for the work. The work itself isn't cancelled when the time is up.

- `true`: the normal deadline. This is the default.
- A number: a deadline in milliseconds.
- `false`: don't wait.

Resources that a cache uses keep their own setting.

### Lifetime

Resources stay loaded until the `Deck` unmounts. Their `dispose` function may be
async, and runs after the computations using them finish.

A cache keeps its results for as long as any view of a slide that used them is
rendered, including across steps. So that slides can remount or switch views
without computing everything again, it also keeps:

- all results of the two most recently unmounted slides, which
  `maxUnusedSlides` changes, and
- up to 8 other results, the most recently used, which `maxUnusedEntries`
  changes.

Set a limit to `Infinity` to keep everything. Set both to `0` to drop results
once their last view leaves. Dropping results doesn't dispose resources.

## Input

Clicks on a slide, and keys like Space and the arrow keys, go to the next or
previous step. Interactive elements take precedence for the input they use:

- Text fields take all navigation keys.
- Widgets like sliders, tabs, and menus take the arrow keys, Home, End, Page Up,
  and Page Down.
- Links and buttons take Space and Enter.

Clicks on any of these don't change the step. If an element handles all input
itself, like a canvas, mark it with `INTERACTIVE_ATTRIBUTE`:

```tsx
<canvas {...{ [INTERACTIVE_ATTRIBUTE]: true }} />
```

## Sizes

Slides are 1280 × 720 logical pixels (`SLIDE_WIDTH` × `SLIDE_HEIGHT`), scaled to
fit the screen or a thumbnail. CSS pixels are logical pixels, so lay out
components in pixels, and they stay sharp at any scale.

Don't use `rem` on slides, because WebKit browsers scale slides with `zoom`,
which doesn't scale `rem`. Use `px` or `em` instead. MUI components are fine,
because the slide theme sizes them in pixels.

## Naming elements

The same slide can be rendered several times on a page, so never use fixed ids
on it. Refer to elements by names, which are unique on their slide:

- `<SlideElement name="arch" component="img" />` renders an element with a name.
  MDX turns elements with an `id`, like `<img id="arch">`, into these.
- `useSlideElementRef(name)` returns a ref that gives an element a name.
- `useSlideElementId(name)` returns an id for the element that is unique in the
  page, e.g., for `aria-labelledby` or SVG references.
- `useSlideElement(target)` returns the element with a name in the same
  rendering of the slide. It also accepts an element, so that a prop like
  `anchor` can take either.
- `useSlideElementRegistry()` names an element that the component doesn't render
  itself, like a node of a diagram. With `{ group }`, the element also counts as
  part of that step group, so that callouts pointing at it come in that step.

Never give the same name to two elements on a slide.

In MDX, components get the name from `#name` or `id=name` as their `id` prop.
Pass it on to `useSlideElementRef`, `SlideElement`, or a `Step`.

## Waiting until the slide is ready

When the slide or its step changes, the audience and presenter views keep
showing the old slide until the new one is ready, and then cut or fade to it.
This way, viewers don't see a half-finished layout.

The new slide is ready when:

- React has finished rendering, including renders started by effects,
- its images and fonts have loaded, and
- no component holds the change.

The views wait at most 150 ms (`SETTLE_DEADLINE`). CSS transitions and
animations that the change started run from the beginning once it's shown.
Browsers without view transitions change the slide at once.

### Holding the change

Call `useTransitionHold(pending)` while a component isn't ready, e.g., while it
loads data:

```tsx
import { useTransitionHold } from '@seminar/core';

export function Plot({ src }: { src: string }) {
  const data = useData(src);
  useTransitionHold(data === undefined, { deadline: 500 });
  return data === undefined ? null : <Chart data={data} />;
}
```

`deadline` is how long the change may wait, in milliseconds, instead of 150 ms.
If several components hold the change, the longest deadline wins, up to a few
seconds.

A hold only delays changes that happen while it's pending, so a component that
never finishes loading delays one change, not every step after it.

### Updating the slide

Other updates, like setting state when a button is clicked, show at once. To
make one wait until the slide is ready, run it with the function that
`useSlideUpdate` returns:

```tsx
import { useSlideState, useSlideUpdate } from '@seminar/core';

export function Reveal() {
  const [shown, setShown] = useSlideState(false);
  const updateSlide = useSlideUpdate();
  return shown ? (
    <Plot src="data.csv" />
  ) : (
    <Button onClick={() => updateSlide(() => setShown(true))}>Show</Button>
  );
}
```

The views keep showing the button until `Plot` stops holding the change, and
then cut to it.

Don't use it for updates that come quickly one after another, like typing or
dragging, because each update cuts short the one before it. Set state as usual
for these.

The update may run a moment later, but always before any later update or change
of the slide. Browsers without view transitions update the slide at once.

### Measuring

Measure in layout effects, because they run before the change is shown.

To measure again when an element resizes, use `useMeasure(element, measure)`
instead of your own `ResizeObserver`. Some browsers don't run resize observers
while the views wait. In `measure`, only set state if the value changed.

## Positioning

`useSlideBox(target)` measures an element, or the element with a name, in
logical pixels from the top left corner of the slide, at any scale. It measures
again on resize, and returns `undefined` until the element is measured.

`useSlidePoint(target, { at, shift })` returns a point in the box of an element,
or of the slide without a target. For example, it can tell where an arrow should
point at a part of an image.

Points are `SlidePoint`s. In MDX, write them in logical pixels or in percentages
of the box:

```mdx
<Marker for="arch" at="120,80" />
<Marker for="arch" at="62%,40%" />
```

`parseSlidePoint` and `resolveSlidePoint` work with them directly.

To draw at the point, measure where the component itself is, and place the
drawing relative to that. Callouts work this way:

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
