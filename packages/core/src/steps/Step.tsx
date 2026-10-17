import { generateUtilityClasses } from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import {
  styled,
  useTheme,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import {
  use,
  type ElementType,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
} from 'react';

import {
  useSlideElementId,
  useSlideElementRef,
} from '../slide/SlideElements.tsx';
import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
import {
  appearanceClass,
  BUILT_IN_STEP_BEHAVIORS,
  moreHidden,
  rankAppearances,
  StepAppearanceContext,
  type BuiltInStepBehavior,
  type StepAppearances,
} from './stepAppearance.ts';
import type { StepPhase } from './StepStore.ts';
import { StepBehaviorContext } from './StepBehaviorContext.ts';
import type { FadeProps } from '../slide/fades.ts';
import { TogetherContext } from './TogetherContext.ts';
import { useStep, type StepState, type StepWith } from './useSteps.ts';

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
 * Separates the behavior shorthands (see {@link StepBehaviorShorthands})
 * from the other `props`, which are passed to the element.
 *
 * @returns The behavior of the shorthand, if any, or of the last one if there
 *   are several, and the other props.
 */
function splitShorthands<Props extends object>(
  theme: Theme,
  props: Props,
): [behavior: StepBehavior | undefined, other: Props] {
  let behavior: StepBehavior | undefined;
  const other = Object.fromEntries(
    Object.entries(props).filter(([name, value]) => {
      if (
        !Object.hasOwn(BUILT_IN_STEP_BEHAVIORS, name) &&
        !Object.hasOwn(theme.stepBehaviors ?? {}, name)
      ) {
        return true;
      }
      // `false` turns the shorthand off, e.g., `only={false}`.
      if (value === true || value === '') {
        behavior = name as StepBehavior;
      }
      return false;
    }),
  ) as Props;
  return [behavior, other];
}

/** Returns how `behavior` looks in each phase in `theme`. */
function appearancesOf(theme: Theme, behavior: StepBehavior): StepAppearances {
  const builtIn = BUILT_IN_STEP_BEHAVIORS as Partial<
    Record<StepBehavior, StepAppearances>
  >;
  return (
    theme.stepBehaviors?.[behavior] ??
    builtIn[behavior] ??
    BUILT_IN_STEP_BEHAVIORS.reveal
  );
}

/**
 * Shorthands for step behaviors, e.g., `<Step only>` or `:step{only}` for
 * `behavior="only"`.
 */
export type StepBehaviorShorthands = Partial<
  Record<StepBehavior, boolean | '' | undefined>
>;

export interface StepProps
  extends
    Omit<HTMLAttributes<HTMLElement>, 'children'>,
    StepBehaviorShorthands,
    FadeProps {
  /**
   * See {@link StepWith}. Ignored directly inside a {@link Together}, which
   * determines the step instead.
   */
  with?: StepWith | undefined;
  /**
   * Name of the element of the step on the slide, which gets an id unique in
   * the document (see `useSlideElementId`). The step joins the group of the
   * same name, unless `group` is set.
   */
  id?: string | undefined;
  /** See the `group` option of `useSteps`. Defaults to `id`. */
  group?: string | undefined;
  /**
   * Name of the group to nest the step in, as if it was inside the elements of
   * the group, or an element whose step to nest it in. See the `in` option of
   * `useSteps`.
   */
  in?: string | Element | undefined;
  /** See the `after` option of `useSteps`. */
  after?: string | undefined;
  /**
   * Shows the step with a step of its own, like `with="self"`, e.g., `step`
   * in a directive. Ignored if `with` is set.
   */
  step?: boolean | '' | undefined;
  /**
   * How the step is attached to the steps by default, unless it's placed
   * with `with`, `step`, `in`, or `after`, or joins a group with other
   * steps. Wrapper components can use this to choose their usual place:
   *
   * - `{ with: 'previous' }` or `{ with: 'initial' }` makes the step inert
   *   by default, e.g., list items, which are shown with the previous step
   *   unless they set a step behavior, e.g., `only`, as well.
   * - `{ in: group }` nests the step in a group or in the step of an
   *   element, e.g., callouts in the step of the element they point at.
   *
   * Steps creating a group, e.g., with an `id`, still use their default.
   */
  defaultAttachment?: StepAttachment | undefined;
  /**
   * Title of the step in the tree of steps, instead of its text. Unlike the
   * HTML attribute, it isn't shown as a tooltip.
   */
  title?: string | undefined;
  /**
   * How the step behaves across its phases. Defaults to a shorthand like
   * `only` (see {@link StepBehaviorShorthands}), then to `defaultBehavior`,
   * the `steps` of the slide, the `defaultProps` of the theme, and finally
   * `'reveal'`.
   */
  behavior?: StepBehavior | undefined;
  /**
   * Behavior to use when neither `behavior` nor a behavior shorthand is set.
   * Wrapper components can use this to choose their usual behavior while
   * still supporting built-in and theme-defined shorthands. Takes precedence
   * over the default of the slide and theme.
   */
  defaultBehavior?: StepBehavior | undefined;
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

/** How a step is attached to the steps by default, see `Step`. */
export type StepAttachment =
  { with: 'previous' | 'initial' } | { in: string | Element };

/**
 * Attaches a step to the previous step by default, e.g., for content shown
 * in order with the steps around it, like paragraphs.
 */
export const WITH_PREVIOUS: StepAttachment = { with: 'previous' };

/** Attaches a step to the initial step by default, i.e., shows it up front. */
export const WITH_INITIAL: StepAttachment = { with: 'initial' };

export type StepClassKey =
  'root' | StepPhase | 'hidden' | 'dimmed' | 'collapsed';

export const stepClasses: Record<StepClassKey, string> = generateUtilityClasses(
  'SliderStep',
  [
    'root',
    'distantFuture',
    'future',
    'current',
    'open',
    'past',
    'distantPast',
    'hidden',
    'dimmed',
    'collapsed',
  ],
);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderStep: StepClassKey;
  }

  interface ComponentsPropsList {
    SliderStep: StepProps;
  }

  interface Components<Theme = unknown> {
    SliderStep?: ComponentTheme<'SliderStep', Theme> | undefined;
  }
}

interface StepOwnerState extends StepProps {
  behavior: StepBehavior;
  phase: StepPhase;
}

const StepRoot = styled('div', {
  name: 'SliderStep',
  slot: 'Root',
})<{ ownerState: StepOwnerState }>({
  // Steps change at once: views that show them fade the whole slide instead
  // (see `SlideTransitions`), since parents and nested steps fading at the
  // same time would show the nested steps through.
  // Keep the space of hidden content, so that the layout doesn't shift.
  [`&.${stepClasses.hidden}`]: { visibility: 'hidden', opacity: 0 },
  [`&.${stepClasses.dimmed}`]: {
    opacity: 'var(--SliderStep-dim-opacity, 0.35)',
  },
  [`&.${stepClasses.collapsed}`]: { display: 'none' },
});

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
 * DOM or with `in`. Steps don't repeat the look they inherit from enclosing
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
 * Can be themed as `SliderStep` in the `components` of the MUI theme. The step
 * has a class for its phase (`SliderStep-distantFuture`, `-future`,
 * `-current`, `-open`, `-past`, or `-distantPast`, see {@link StepPhase}),
 * and `SliderStep-dimmed`, `-hidden`, or `-collapsed` if it has to dim,
 * hide, or collapse itself, or the class of an
 * appearance added by the theme (see {@link StepAppearanceOverrides}). The
 * opacity of dimmed steps is the `--SliderStep-dim-opacity` custom property.
 * Add behaviors with `stepBehaviors` in the theme, which map phases to
 * appearances, and style further appearances by their classes here, e.g.,
 * `{ root: { '&.SliderStep-blurred': { filter: 'blur(4px)' } } }`, rather
 * than styling behaviors or phases, which nested steps don't inherit.
 */
export function Step(inProps: StepProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderStep' });
  const theme = useTheme();
  const slideBehavior = use(StepBehaviorContext);
  const enclosing = use(StepAppearanceContext);
  const {
    component = 'div',
    with: withStep,
    id,
    group = id,
    in: parent,
    after,
    step: ownStep,
    defaultAttachment,
    title,
    behavior: themeBehavior,
    defaultBehavior,
    cut,
    fade,
    fadeIn,
    fadeOut,
    fadeBefore,
    fadeAfter,
    className,
    children,
    ...rest
  } = props;
  const [shorthand, other] = splitShorthands(theme, rest);
  // The behavior of the slide takes precedence over the default of the theme.
  const behavior =
    inProps.behavior ??
    shorthand ??
    defaultBehavior ??
    slideBehavior ??
    themeBehavior ??
    'reveal';
  const appearances = rankAppearances(theme, appearancesOf(theme, behavior));
  const together = use(TogetherContext);
  const explicitWith =
    withStep ?? (ownStep === true || ownStep === '' ? 'self' : undefined);
  // Steps placed explicitly aren't attached by default. Joining a group with
  // other steps is left to the store, which knows the group.
  const attachment =
    together !== undefined ||
    explicitWith !== undefined ||
    parent !== undefined ||
    after !== undefined
      ? undefined
      : defaultAttachment;
  // Inert steps become steps of their own with a behavior of their own.
  const defaultWith =
    attachment !== undefined &&
    'with' in attachment &&
    inProps.behavior === undefined &&
    shorthand === undefined
      ? attachment.with
      : undefined;
  const step = useStep({
    with: together ?? explicitWith,
    group,
    in: parent,
    defaultIn:
      attachment !== undefined && 'in' in attachment
        ? attachment.in
        : undefined,
    defaultWith,
    after,
    title,
    appearances,
    fades: { cut, fade, fadeIn, fadeOut, fadeBefore, fadeAfter },
  });
  const { phase, inherited } = step;
  const elementId = useSlideElementId(id ?? '');
  const elementRef = useSlideElementRef(id ?? '');
  const ref = useForkRef(step.ref, id === undefined ? null : elementRef);
  // Elements inside a step already look like it, e.g., hidden or dimmed.
  const appearance = moreHidden(
    moreHidden(appearances[phase], inherited),
    enclosing,
  );
  return (
    <StepRoot
      as={component}
      ref={ref}
      id={id === undefined ? undefined : elementId}
      className={classNames(
        stepClasses.root,
        stepClasses[phase],
        appearanceClass('SliderStep', appearance, enclosing),
        className,
      )}
      ownerState={{ ...props, behavior, phase }}
      {...other}
    >
      <StepAppearanceContext value={appearance}>
        {/* Steps nested inside this one don't join the enclosing Together. */}
        <TogetherContext value={undefined}>
          {typeof children === 'function' ? children(step) : children}
        </TogetherContext>
      </StepAppearanceContext>
    </StepRoot>
  );
}
