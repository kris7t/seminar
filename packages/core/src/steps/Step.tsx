import { useForkRef } from '@mui/material/utils';
import {
  styled,
  useTheme,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import {
  createElement,
  use,
  type ElementType,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';

import {
  useSlideElementId,
  useSlideElementRef,
} from '../slide/SlideElements.tsx';
import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import {
  splitShorthands,
  StepAppearanceContext,
  stepperClasses,
  type BuiltInStepBehavior,
  type StepAppearances,
  type StepperClassKey,
} from './stepAppearance.ts';
import type { StepPhase } from './StepNode.ts';
import { StepBehaviorContext } from './StepBehaviorContext.ts';
import { SlideViewContext } from '../view/SlideViewContext.ts';
import { useStep, type StepState, type UseStepsOptions } from './useSteps.ts';

interface DocumentStepProps extends HTMLAttributes<HTMLElement> {
  component: ElementType;
  ref?: Ref<Element> | undefined;
}

/** A step in a `document` view, which is its element without styles. */
function DocumentStep({ component, ...props }: DocumentStepProps): ReactNode {
  // Use `createElement` to avoid tripping `static-components`.
  return createElement(component, props);
}

/** The props that `useStep` reads, which aren't for the element. */
const STEPPER_PROPS: ReadonlySet<string> = new Set([
  'with',
  'group',
  'in',
  'after',
  'step',
  'initial',
  'title',
  'split',
  'overlay',
  'cut',
  'fade',
  'fadeIn',
  'fadeOut',
  'fadeBefore',
  'fadeAfter',
]);

/**
 * Further behaviors of steps. Add them by module augmentation, e.g.,
 * `interface StepBehaviorOverrides { fancy: true }`, and give them appearances
 * with `stepBehaviors` in the theme.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface StepBehaviorOverrides {}

/**
 * How a step looks before, while, and after it's the current step:
 *
 * | Behavior  | future    | current, open | past      | distant past |
 * | --------- | --------- | ------------- | --------- | ------------ |
 * | `reveal`  | hidden    | shown         | shown     | shown        |
 * | `dim`     | hidden    | shown         | dimmed    | dimmed       |
 * | `preview` | dimmed    | shown         | shown     | shown        |
 * | `focus`   | dimmed    | shown         | dimmed    | dimmed       |
 * | `only`    | hidden    | shown         | hidden    | hidden       |
 * | `scoped`  | hidden    | shown         | shown     | hidden       |
 * | `insert`  | collapsed | shown         | shown     | shown        |
 * | `expand`  | collapsed | shown         | shown     | collapsed    |
 * | `swap`    | collapsed | shown         | collapsed | collapsed    |
 * | `always`  | shown     | shown         | shown     | shown        |
 *
 * Hidden steps keep their space in the layout, while collapsed steps take no
 * space, so `insert` makes room for a step when it's shown, `expand` also
 * frees it once the step it's nested in is past, and `swap` shows steps one
 * after another in the same place. The distant future looks like
 * the future. See {@link StepPhase} for the
 * phases. Themes can change these and add
 * further behaviors (see {@link StepBehaviorOverrides}) with `stepBehaviors`.
 */
export type StepBehavior =
  | BuiltInStepBehavior
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof StepBehaviorOverrides;

declare module '@mui/material/styles' {
  interface Theme {
    /**
     * How the behaviors of steps look in each phase, in addition to and
     * overriding the built-in ones (see {@link StepBehavior}).
     */
    stepBehaviors?: Partial<Record<StepBehavior, StepAppearances>> | undefined;
  }

  interface ThemeOptions {
    stepBehaviors?: Partial<Record<StepBehavior, StepAppearances>> | undefined;
  }
}

/**
 * Shorthands for step behaviors, e.g., `<Step only>` or `:step{only}` for
 * `behavior="only"`. Those of {@link StepBehaviorOverrides} are mapped from
 * its keys, so that editors find where they're declared.
 */
export type StepBehaviorShorthands = Partial<
  Record<BuiltInStepBehavior, boolean | undefined>
> & {
  [Behavior in keyof StepBehaviorOverrides]?: boolean | undefined;
};

export interface StepProps
  extends
    Omit<HTMLAttributes<HTMLElement>, 'children' | 'id' | 'title'>,
    UseStepsOptions {
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

export type StepClassKey = StepperClassKey | 'hidden' | 'dimmed' | 'collapsed';

export const stepClasses: Record<StepClassKey, string> = {
  ...stepperClasses('SeminarStep'),
  hidden: 'SeminarStep-hidden',
  dimmed: 'SeminarStep-dimmed',
  collapsed: 'SeminarStep-collapsed',
};

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarStep: StepClassKey;
  }

  interface ComponentsPropsList {
    SeminarStep: StepProps;
  }

  interface Components<Theme = unknown> {
    SeminarStep?: ComponentTheme<'SeminarStep', Theme> | undefined;
  }
}

interface StepOwnerState extends StepProps {
  behavior: StepBehavior;
  phase: StepPhase;
}

const StepRoot = styled('div', {
  name: 'SeminarStep',
  slot: 'Root',
})<{ ownerState: StepOwnerState }>({});

/**
 * Content shown from a step of the presentation.
 *
 * Its `behavior` determines how it looks before, while, and after it's the
 * current step (see {@link StepBehavior}). Hidden steps keep their space in the
 * layout. Steps inside the step are nested inside it, and are shown after it.
 * Steps can also be nested in a group elsewhere with `in`.
 *
 * Nested steps look at least as hidden as the step they are nested in, e.g.,
 * a step nested in a dimmed step is dimmed, too, whether it's nested in the
 * DOM or with `in`. Steps don't repeat the appearance they inherit from enclosing
 * elements, so that they aren't dimmed twice.
 *
 * The fade props, i.e., `fade`, `fadeIn`, `fadeOut`, `fadeBefore`,
 * `fadeAfter`, and `cut`, set how long the slide fades when the turn of the
 * step starts or ends, like those of slides, but between steps. Going from
 * one step to another, e.g., to a later one, ends the turn of the steps
 * shown after them, and starts the turn of the steps shown before them. Of
 * the fades that these steps set for the sides crossed, the most explicit
 * ones count: a cut wins, or else the longest one, so that every step gets
 * at least the time it asks for, e.g., for an animation. Otherwise, the
 * `fade` of the slide counts.
 *
 * Can be themed as `SeminarStep` in the `components` of the MUI theme. The step
 * has a class for its phase (`SeminarStep-distantFuture`, `-future`,
 * `-current`, `-open`, `-past`, or `-distantPast`, see {@link StepPhase}),
 * and `SeminarStep-dimmed`, `-hidden`, or `-collapsed` if it has to dim,
 * hide, or collapse itself, or the class of an
 * appearance added by the theme (see {@link StepAppearanceOverrides}). The
 * opacity of dimmed steps is the `--SeminarStep-dim-opacity` custom property.
 * Add behaviors with `stepBehaviors` in the theme, which map phases to
 * appearances, and style further appearances with `stepAppearanceStyles`, e.g.,
 * `{ blurred: { filter: 'blur(4px)' } }`, rather than styling behaviors or phases,
 * which nested steps don't inherit.
 */
export function Step(inProps: StepProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarStep' });
  const theme = useTheme();
  const slideBehavior = use(StepBehaviorContext);
  const {
    component = 'div',
    id,
    defaults,
    behavior: themeBehavior,
    className,
    sx,
    children,
    ...rest
  } = props;
  const view = use(SlideViewContext);
  const [shorthand, withoutShorthands] = splitShorthands(theme, rest);
  const other = Object.fromEntries(
    Object.entries(withoutShorthands).filter(
      ([name]) => !STEPPER_PROPS.has(name),
    ),
  ) as HTMLAttributes<HTMLElement>;
  const behavior =
    inProps.behavior ??
    shorthand ??
    defaults?.behavior ??
    slideBehavior ??
    themeBehavior ??
    'reveal';
  // A behavior from the theme is only a default, unlike one written here.
  const step = useStep({ ...props, behavior: inProps.behavior });
  const { phase, appearance } = step;
  const elementId = useSlideElementId(id ?? '');
  const elementRef = useSlideElementRef(id ?? '');
  const ref = useForkRef(step.ref, id === undefined ? null : elementRef);
  const content = typeof children === 'function' ? children(step) : children;
  if (view.kind === 'document') {
    // Every step is part of the document, without styles or appearances.
    return (
      <DocumentStep
        component={component}
        ref={ref}
        id={id === undefined ? undefined : elementId}
        className={className}
        {...other}
      >
        {content}
      </DocumentStep>
    );
  }
  return (
    <StepRoot
      as={component}
      ref={ref}
      id={id === undefined ? undefined : elementId}
      className={classNames(
        stepClasses.root,
        stepClasses[phase],
        step.className,
        className,
      )}
      ownerState={{ ...props, behavior, phase }}
      sx={sx}
      {...other}
    >
      <StepAppearanceContext value={appearance}>
        {content}
      </StepAppearanceContext>
    </StepRoot>
  );
}
