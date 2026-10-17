# Steps in components

## Wrapping content in a step

`Step` renders an element that is shown according to the steps of the slide.
It takes the props of `:step`, like `with`, `group`, `in`, `after`, `title`,
and behaviors, and passes the others to its element:

```tsx
import { Step } from '@slider/core';

<Step component="section" only>
  Shown only during its step
</Step>;
```

The position of a step in the document decides its order and nesting: steps
inside a step are nested in it.

Components that should take part in steps wrap their root in a `Step`, and
pass on the step props they get, e.g., from `:::name{step group=parse}`:

```tsx
import { Step, WITH_PREVIOUS, type StepProps } from '@slider/core';

interface NoteProps extends Omit<StepProps, 'defaultAttachment'> {
  tone?: string | undefined;
}

export function Note({ tone, ...stepProps }: NoteProps) {
  return (
    <Step defaultAttachment={WITH_PREVIOUS} data-tone={tone} {...stepProps} />
  );
}
```

## Default placement

Without placement props, a `Step` starts a new step. Components choose where
they go by default with `defaultAttachment`, which applies unless the user
places them with `with`, `step`, `in`, `after`, or a group with other
elements:

- `WITH_PREVIOUS` (`{ with: 'previous' }`) shows the component with the step
  before it, like paragraphs, list items, images, and columns. Such
  components are transparent for nesting: steps inside them are nested as if
  the component wasn't there. `step` in the props gives it a step of its own.
- `WITH_INITIAL` (`{ with: 'initial' }`) shows it up front.
- `{ in: element }` or `{ in: 'name' }` nests it in the step of an element,
  or of a group, like callouts pointing at an element.

`defaultBehavior` sets the behavior of the component unless a behavior
shorthand like `only` or `behavior` is given, e.g., `scoped` for callouts. It
takes precedence over the default of the slide and the theme.

Prefer these defaults over setting `with` or `behavior` directly, so that
users can still override them with attributes.

## Reacting to steps

`useStep()` and `useSteps(count)` create a stepper without rendering an
element. Attach the returned `ref` to the elements that place it in the
document, and read its state:

- `stepIndex`: the current step of the stepper, from 0, or -1 before it,
- `stepCount`: the number of steps,
- `phase`: where the presentation is relative to the stepper, e.g.,
  `future`, `current`, or `past`,
- `isActive` and `isCurrent`.

```tsx
import { useSteps } from '@slider/core';

export function Highlights({ parts }: { parts: string[] }) {
  const { ref, stepIndex } = useSteps(parts.length);
  return (
    <ul ref={ref}>
      {parts.map((part, index) => (
        <li key={part} style={{ fontWeight: index === stepIndex ? 700 : 400 }}>
          {part}
        </li>
      ))}
    </ul>
  );
}
```

Everything stays visible here, and only the highlight follows the steps.
`<Steps count={n}>` does the same with a render function as its children.

`useSteps` takes the same placement options as `Step`, e.g., `with`, `group`,
and `in`. A handle returned by `useStep` can also be passed to the `with` of
other steps, which then share its stepper, e.g., to reveal items of two
lists in parallel.

## Animations

The audience and presenter views fade the whole slide from one step to the
next, as the `stepTransition` of the theme says (see
[Themes](themes.md#transitions)). Where the browser doesn't support
view transitions, or the viewer prefers reduced motion, steps change at
once.

So content that appears, disappears, or dims with the steps needs no
animation of its own. Components that animate in other ways when the step
changes, e.g., moving a marker along a path, should follow these guidelines:

- **Don't fade steps yourself.** A `Step` that fades with CSS fades twice
  with the slide, and its nested steps show through while it fades. Leave
  appearing and disappearing to the steps.
- **Derive the animation from the step state.** Render what the current step
  shows, e.g., the position of the marker for `stepIndex`, and let a CSS
  transition animate between them, rather than starting animations in
  effects. The presenter can jump to any step, e.g., from the overview, the
  step tree, or a recap, where the component must show the end state right
  away.
- **Time animations by the step change.** `useStepTransition()` returns the
  `duration` and `easing` of the fade to the current step, e.g., for
  `transition: transform ${duration}ms ${easing}`. It follows the fades that
  the steps, the slide, and the theme set, so a slow step slows the animation,
  too. The duration is 0 where the slide changes at once: for cuts, in
  thumbnails, previews, and probes, for reduced motion, and when the
  presenter jumps to a step, e.g., from the overview.
- **Keep animations short and interruptible.** Presenters step quickly, e.g.,
  by holding an arrow key. When the step changes again while the slide still
  fades, the fade ends at once, and so do the CSS transitions and animations
  on the slide that started with the step, unless they repeat forever. The
  `duration` of `useStepTransition` becomes 0 then, so components that wait
  or time something by it should follow it, too. Timers of your own don't
  stop by themselves.
- **Set the timing with the steps.** A component that needs more time sets
  the fade of its own steps, e.g., `useStep({ fades: { fade: 500 } })`,
  which slows the fade of the slide along with it.
- **Respect reduced motion.** `useStepTransition` already does. Other
  animations, e.g., ones that loop, should check `useSlideView().animated`.
- **Keep views in step.** The audience window and the presenter view render
  the slide separately, so an animation must not depend on state of its own,
  like a random start or the time it mounted, but only on the steps and the
  slide state, so that both views show the same.

### Animating outside of the fade

A component that animates itself still fades in with the rest of the slide,
which blurs a movement into a cross-fade of where the element was and where
it moves. `useOwnAnimation` keeps an element out of the fade between steps: the
element shows how it is right away, and its own transitions play out in
full. It still fades with the slide when the slide changes.

```tsx
import { useOwnAnimation, useStep, useStepTransition } from '@slider/core';

export function Marker() {
  const step = useStep({ group: 'parse' });
  const ownAnimation = useOwnAnimation();
  const { duration, easing } = useStepTransition();
  return (
    <div ref={step.ref}>
      <div
        style={{
          ...ownAnimation,
          transform: step.isActive ? 'translateX(200px)' : 'none',
          transition: `transform ${duration}ms ${easing}`,
        }}
      />
    </div>
  );
}
```

Since the element doesn't fade with the slide, it has to animate appearing
and disappearing itself, if it does, and it's drawn on top of the slide while
the slide fades. Browsers without view transition classes fade it with the
slide.

The `Pipeline` component of the example deck shows this: its stages join the
step groups of the list items on the slide, and light up with them, fading
with the slide, while a marker moves from stage to stage on its own. One of
the items has `fadeBefore=800`, which slows both the fade and the marker
between it and the step before it.

## Showing several steps together

`<Together>` shows the `Step`s directly inside it in a single step, without
rendering an element, e.g., to reveal several list items at once.
