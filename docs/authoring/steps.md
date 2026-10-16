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

## Showing several steps together

`<Together>` shows the `Step`s directly inside it in a single step, without
rendering an element, e.g., to reveal several list items at once.
