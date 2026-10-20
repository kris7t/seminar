# Steps in components

## Wrapping content in a step

`Step` renders an element that is shown according to the steps of the slide.
It takes the props of `:step`, like `with`, `group`, `in`, `after`, `title`,
and behaviors, and passes the others to its element:

```tsx
import { Step } from '@seminar/core';

<Step component="section" only>
  Shown only during its step
</Step>;
```

The position of a step in the document decides its order and nesting: steps
inside a step are nested in it.

Components that should take part in steps wrap their root in a `Step`, and
pass on the step props they get, e.g., from `:::name{step group=parse}`:

```tsx
import { Step, WITH_PREVIOUS, type StepProps } from '@seminar/core';

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
import { useSteps } from '@seminar/core';

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

The slide fades from one step to the next by itself (see
[Themes](themes.md#transitions)). So content that appears, disappears, or
dims with the steps needs no animation of its own.

If a component animates in other ways, like moving a marker, follow these
rules:

- **Don't fade steps yourself.** A step that also fades with CSS fades twice,
  and the steps nested in it show through.
- **Render the current step, and let CSS animate.** Compute how the current
  step looks, like where the marker is for `stepIndex`, and animate changes
  with a CSS transition. Don't start animations in effects: the presenter
  can jump to any step, and then the component must show the end state at
  once.
- **Take the timing from `useStepTransition()`.** Use its `duration` and
  `easing`, like `transition: transform ${duration}ms ${easing}`. The
  duration is 0 whenever the step should change at once, so you don't have
  to check for that yourself.
- **Ask for the time your animation needs.** Set the fade of your step to
  the shortest time in which the animation still explains what changes,
  e.g., `useStep({ fades: { fade: 500 } })`. Steps that change at the same
  time can only make it longer, and the slide fades as long, too.
- **Expect a duration of 0 anyway.** The author can cut the step, and the
  presenter can skip it, so the component must also work without its
  animation. Don't cut steps yourself to make them fast: leave out the fade
  to take the time of the theme, or ask for 0, which other steps can
  outweigh.
- **Keep animations in JavaScript in step.** CSS transitions and animations
  do this by themselves. Animations in JavaScript, like drawing on a canvas,
  should:
  - start only once `shown` of `useStepTransition()` is `true`, since the
    views may still show the old step for a moment, and
  - jump to their end once `skipped` is `true`, since the presenter has
    moved on.
- **Keep animations short.** Presenters step quickly.
- **Respect reduced motion.** `useStepTransition` already does. For other
  animations, like ones that loop, check `useSlideView().animated`.
- **Show the same in every view.** The audience and presenter views render
  the slide separately. Base animations only on the steps and the slide
  state, not on random values or when the component mounted.

In Firefox and Safari, the slide cuts instead of fading. `useStepTransition`
still gives the timing of the step there, so components animate as usual.

### Animating outside of the fade

While the slide fades, a moving element fades too, which looks like a blurry
cross-fade between where it was and where it goes. To keep an element out of
the fade between steps, add `useOwnAnimation()` to its style. The element
then shows its new state at once, and its own transition plays in full. It
still fades when the slide changes.

```tsx
import { useOwnAnimation, useStep, useStepTransition } from '@seminar/core';

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

Such an element doesn't fade in or out with the steps. If it appears or
disappears, animate that yourself, too.

The `Pipeline` component of the example deck shows all of this. Its stages
light up with the list items, and fade with the slide. Its marker moves from
stage to stage by itself, as slowly as the steps fade. Before the last
stage, it holds the change with `useTransitionHold` to pause for a moment.

## Showing several steps together

`<Together>` shows the `Step`s directly inside it in a single step, without
rendering an element, e.g., to reveal several list items at once.
