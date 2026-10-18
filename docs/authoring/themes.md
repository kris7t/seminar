# Themes

A theme is a module whose default export is an MUI theme made with
`createSlideTheme`, which a deck selects with `theme:` in its frontmatter:

```tsx
import { createSlideTheme } from '@slider/core';

export default createSlideTheme({
  palette: { primary: { main: '#00639b' } },
  master: { section: SectionMaster },
});
```

`createSlideTheme` sizes the typography for slides and provides the built-in
masters, and merges the options on top. A theme module can also export a
[`slider` config](plugins.md#the-config) for compiling decks,
e.g., directives and the options of plugins.

## Masters

Masters lay out the content of slides. They get the `title`, the `className`
of the slide, which they should add to their root, and the content as
`children`:

```tsx
import { Stack, Typography } from '@mui/material';
import type { SlideMasterProps } from '@slider/core';

function SectionMaster({ title, className, children }: SlideMasterProps) {
  return (
    <Stack component="section" className={className} sx={{ height: '100%' }}>
      <Typography variant="h2" component="h1">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}
```

`master` in the theme options replaces the built-in `content`, `title`,
`section`, and `subsection` masters, or adds new ones, which slides select by
name, e.g., `## Results {wide}`. A deck can also import a master and pass it
to a slide, e.g., `{master=ClosingMaster}`.

## Theming components

Components of slider and its elements can be themed in the `components` of
the theme, like MUI components, by their names, e.g., `SliderStep`,
`SliderImage`, `SliderCallout`, or `SliderColumn`:

```ts
createSlideTheme({
  components: {
    SliderCallout: { defaultProps: { color: 'secondary', elevation: 2 } },
    SliderColumn: {
      styleOverrides: { heading: { textTransform: 'uppercase' } },
    },
  },
});
```

Each component documents its slots, like `root` and `heading`, as class keys,
and adds classes like `SliderColumn-heading` to them.

Components of plugins can follow the same pattern:

1. Read props with `useThemeProps({ props, name: 'MyNote' })`.
2. Build slots with `styled(…, { name: 'MyNote', slot: 'Root' })`, and pass
   the props that affect styles as `ownerState`.
3. Register the name with the MUI theme by module augmentation, using
   `ComponentTheme` from `@slider/core`:

```ts
import type { ComponentTheme } from '@slider/core';

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    MyNote: 'root' | 'heading';
  }
  interface ComponentsPropsList {
    MyNote: NoteProps;
  }
  interface Components<Theme = unknown> {
    MyNote?: ComponentTheme<'MyNote', Theme> | undefined;
  }
}
```

## Step behaviors and appearances

Steps look one of a few ways, their appearances: `shown`, `dimmed`,
`hidden`, which keeps the space of the content, or `collapsed`, which removes
it from the layout. A behavior, like `dim`, says which appearance a step has in each
phase:

- `future`, refined by `distantFuture` before its parent step,
- `current`, refined by `open` while its nested steps are shown, and
- `past`, refined by `distantPast` once its parent step is past.

### Ranks of appearances

Each appearance has a rank, which orders them by precedence:

| Appearance  | Rank |
| ----------- | ---- |
| `shown`     | 0    |
| `dimmed`    | 100  |
| `hidden`    | 200  |
| `collapsed` | 300  |

Nested steps look at least as hidden as the steps they're nested in, so the
rank decides which appearance wins when they meet. A step whose own
appearance is `shown` in a `dimmed` step is dimmed, too, and a `dimmed` step
in a `hidden` step is hidden. This holds whether the step is nested in the
document or with `in`.

A step only applies its appearance itself, with a class like
`SliderStep-dimmed`, when it's ranked higher than that of the step element
around it in the document, which already applies to everything inside it, so
that content isn't dimmed twice. A step nested with `in`, on the other hand,
isn't inside the element of its parent, so it applies the appearance it
inherits with its own class.

The rank is a precedence, rather than literally how hidden the content is:
an appearance overrides those ranked below it, and is overridden by those
ranked above it. To add an appearance, slot it in by what should win when
steps nest:

- Between `shown` and `dimmed`, e.g., `emphasized` at 10 or `blurred` at 50,
  for something that applies to the content inside it, but that dimmed and
  hidden steps around it override.
- Between `dimmed` and `hidden`, e.g., `ghosted` at 150, for something
  stronger than dimming that still shows the content.

For example, an `emphasized` step at 10 makes the steps nested in it
emphasized, too, even those nested with `in`, while an emphasized step in a
dimmed step is only dimmed. A dimmed step in an emphasized one is dimmed, and
if it's inside the emphasized element in the document, it keeps the styles
of the emphasis, too, since they apply to everything inside the element.

Ranks must be above 0, the rank of `shown`, which steps fall back to without
a step around them, and which doesn't need a class. So an appearance can't
be "more shown than shown": a shown step nested in it would have to undo
its styles, which CSS can't do for the elements inside it. Give every
appearance a rank of its own: on a tie, the appearance of the step itself
wins over the one it inherits. `stepAppearances` in the theme sets the ranks
of new appearances, and can also change those of the built-in ones.

So themes customize steps in two layers:

1. **Appearances** say how a step looks. Style them by their class, and add
   new ones with a rank between the others, as above.
2. **Behaviors** say which appearance a step has in each phase. Change them
   or add new ones with `stepBehaviors`.

For example, a `blurred` appearance between shown and dimmed, and a `blur`
behavior that blurs past steps:

```ts
declare module '@slider/core' {
  interface StepAppearanceOverrides {
    blurred: true;
  }
  interface StepBehaviorOverrides {
    blur: true;
  }
}

createSlideTheme({
  stepAppearances: { blurred: 50 },
  stepBehaviors: { blur: { future: 'hidden', past: 'blurred' } },
  components: {
    SliderStep: {
      styleOverrides: {
        root: { '&.SliderStep-blurred': { filter: 'blur(4px)' } },
      },
    },
  },
});
```

`<Steps>` applies appearances with its own classes, like `SliderSteps-blurred`,
so style those in `SliderSteps` as well. Decks then use `:step{blur}` or
`{steps=blur}`. A step nested in a blurred step is blurred with it, while a
blurred step nested in a dimmed or hidden step stays dimmed or hidden.

Appearances apply at once, without CSS transitions: the audience and
presenter views fade the whole slide from one step to the next instead, see
[Transitions](#transitions). Transitions on appearance classes
would fade a step and the steps nested in it at the same time, which shows
the nested steps through while they should stay hidden.

Style appearances rather than behaviors or phases: a style attached to
`behavior: 'blur'` or to `SliderStep-past` applies to that step only, so
steps nested in it don't inherit it, and it ignores whether a step around it
already hides or dims it more. The dimming of `dimmed` can be adjusted with
the `--SliderStep-dim-opacity` custom property.

## Transitions

The audience and presenter views fade the slide with view transitions
scoped to the slide, e.g., in Chrome. Browsers without them, e.g., Firefox
and Safari, cut instead, since their transitions of the whole page would
cover the menu button and stutter the components that animate themselves.
Viewers who prefer reduced motion see no fades. Swiping moves the slides
instead.

`stepTransition` and `slideTransition` set the fades between steps and
between slides:

```ts
createSlideTheme({
  stepTransition: { duration: 200, easing: 'ease-out' },
  slideTransition: { duration: 300 },
});
```

Steps fade for 150 ms by default, and slides cut. A duration of 0 changes
at once.
Cuts and fades both wait until the changed slide is ready, see
[Waiting until the slide is ready](components.md#waiting-until-the-slide-is-ready).

Masters can set `fade`, `fadeIn`, `fadeOut`, `fadeBefore`, `fadeAfter`, and
`cut`, like slides (see
[Fades between slides](../core/decks.md#fades-between-slides)). The
attributes of a slide take precedence.

```ts
// Section slides have a background of their own.
SectionMaster.cut = true;

createSlideTheme({ master: { section: SectionMaster } });
```

In code, `cut` can also be an array of sides, e.g., `['in', 'after']`.
