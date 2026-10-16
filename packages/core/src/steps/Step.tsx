import { generateUtilityClasses } from '@mui/material';
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

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
import {
  appearanceClass,
  BUILT_IN_STEP_VARIANTS,
  moreHidden,
  rankAppearances,
  StepAppearanceContext,
  type BuiltInStepVariant,
  type StepAppearances,
} from './stepAppearance.ts';
import type { StepPhase } from './StepStore.ts';
import { StepVariantContext } from './StepVariantContext.ts';
import { TogetherContext } from './TogetherContext.ts';
import { useStep, type StepState, type StepWith } from './useSteps.ts';

/**
 * Further variants of steps. Add them by module augmentation, e.g.,
 * `interface StepVariantOverrides { fancy: true }`, and give them appearances
 * with `stepVariants` in the theme.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface StepVariantOverrides {}

/**
 * How a step looks before, while, and after it's the current step:
 *
 * | Variant   | future | current, open | past   | distant past |
 * | --------- | ------ | ------------- | ------ | ------------ |
 * | `reveal`  | hidden | shown         | shown  | shown        |
 * | `dim`     | hidden | shown         | dimmed | dimmed       |
 * | `preview` | dimmed | shown         | shown  | shown        |
 * | `focus`   | dimmed | shown         | dimmed | dimmed       |
 * | `only`    | hidden | shown         | hidden | hidden       |
 * | `scoped`  | hidden | shown         | shown  | hidden       |
 *
 * The distant future looks like the future. See {@link StepPhase} for the
 * phases. Themes can change these and add
 * further variants (see {@link StepVariantOverrides}) with `stepVariants`.
 */
export type StepVariant =
  | BuiltInStepVariant
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof StepVariantOverrides;

declare module '@mui/material/styles' {
  interface Theme {
    /**
     * How the variants of steps look in each phase, in addition to and
     * overriding the built-in ones (see {@link StepVariant}).
     */
    stepVariants?: Partial<Record<StepVariant, StepAppearances>> | undefined;
  }

  interface ThemeOptions {
    stepVariants?: Partial<Record<StepVariant, StepAppearances>> | undefined;
  }
}

/**
 * Separates the shorthands of variants (see {@link StepVariantShorthands})
 * from the other `props`, which are passed to the element.
 *
 * @returns The variant of the shorthand, if any, or of the last one if there
 *   are several, and the other props.
 */
function splitShorthands<Props extends object>(
  theme: Theme,
  props: Props,
): [variant: StepVariant | undefined, other: Props] {
  let variant: StepVariant | undefined;
  const other = Object.fromEntries(
    Object.entries(props).filter(([name, value]) => {
      if (
        !Object.hasOwn(BUILT_IN_STEP_VARIANTS, name) &&
        !Object.hasOwn(theme.stepVariants ?? {}, name)
      ) {
        return true;
      }
      // `false` turns the shorthand off, e.g., `only={false}`.
      if (value === true || value === '') {
        variant = name as StepVariant;
      }
      return false;
    }),
  ) as Props;
  return [variant, other];
}

/** Returns how `variant` looks in each phase in `theme`. */
function appearancesOf(theme: Theme, variant: StepVariant): StepAppearances {
  const builtIn = BUILT_IN_STEP_VARIANTS as Partial<
    Record<StepVariant, StepAppearances>
  >;
  return (
    theme.stepVariants?.[variant] ??
    builtIn[variant] ??
    BUILT_IN_STEP_VARIANTS.reveal
  );
}

/** How long steps take to appear, disappear, or dim, in milliseconds. */
const TRANSITION_DURATION = 150;

/**
 * Shorthands for the variants of steps, e.g., `<Step only>` or `:step{only}`
 * for `variant="only"`.
 */
export type StepVariantShorthands = Partial<
  Record<StepVariant, boolean | '' | undefined>
>;

export interface StepProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'>, StepVariantShorthands {
  /**
   * See {@link StepWith}. Ignored directly inside a {@link Together}, which
   * determines the step instead.
   */
  with?: StepWith | undefined;
  /** See the `group` option of `useSteps`. */
  group?: string | undefined;
  /**
   * Name of the group to nest the step in, as if it was inside the elements of
   * the group. See the `in` option of `useSteps`.
   */
  in?: string | undefined;
  /** See the `after` option of `useSteps`. */
  after?: string | undefined;
  /**
   * Title of the step in the tree of steps, instead of its text. Unlike the
   * HTML attribute, it isn't shown as a tooltip.
   */
  title?: string | undefined;
  /**
   * How the step looks in its phases. Defaults to a shorthand like `only`
   * (see {@link StepVariantShorthands}), then to the `steps` of the slide,
   * then to the `defaultProps` of the theme, then to `'reveal'`.
   */
  variant?: StepVariant | undefined;
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

export type StepClassKey = 'root' | StepPhase | 'hidden' | 'dimmed';

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
  variant: StepVariant;
  phase: StepPhase;
}

const StepRoot = styled('div', {
  name: 'SliderStep',
  slot: 'Root',
})<{ ownerState: StepOwnerState }>({
  transition: `opacity ${String(TRANSITION_DURATION)}ms, visibility ${String(TRANSITION_DURATION)}ms`,
  // Keep the space of hidden content, so that the layout doesn't shift.
  [`&.${stepClasses.hidden}`]: { visibility: 'hidden', opacity: 0 },
  [`&.${stepClasses.dimmed}`]: {
    opacity: 'var(--SliderStep-dim-opacity, 0.35)',
  },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
});

/**
 * Content shown from a step of the presentation.
 *
 * Its `variant` determines how it looks before, while, and after it's the
 * current step (see {@link StepVariant}). Hidden steps keep their space in the
 * layout. Steps inside the step are nested inside it, and are shown after it.
 * Steps can also be nested in a group elsewhere with `in`.
 *
 * Nested steps look at least as hidden as the step they are nested in, e.g.,
 * a step nested in a dimmed step is dimmed, too, whether it's nested in the
 * DOM or with `in`. Steps don't repeat the look they inherit from enclosing
 * elements, so that they aren't dimmed twice.
 *
 * Can be themed as `SliderStep` in the `components` of the MUI theme. The step
 * has a class for its phase (`SliderStep-distantFuture`, `-future`,
 * `-current`, `-open`, `-past`, or `-distantPast`, see {@link StepPhase}),
 * and `SliderStep-hidden` or
 * `SliderStep-dimmed` if it has to hide or dim itself, or the class of an
 * appearance added by the theme (see {@link StepAppearanceOverrides}). The
 * opacity of dimmed steps is the `--SliderStep-dim-opacity` custom property.
 * Add variants with `stepVariants` in the theme, and style them with
 * `variants` here, e.g.,
 * `{ props: { variant: 'fancy' }, style: { '&.SliderStep-current': { color:
 * 'red' } } }`. Only hiding and dimming are inherited by nested steps.
 */
export function Step(inProps: StepProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderStep' });
  const theme = useTheme();
  const slideVariant = use(StepVariantContext);
  const enclosing = use(StepAppearanceContext);
  const {
    component = 'div',
    with: withStep,
    group,
    in: parent,
    after,
    title,
    variant: themeVariant,
    className,
    children,
    ...rest
  } = props;
  const [shorthand, other] = splitShorthands(theme, rest);
  // The variant of the slide takes precedence over the default of the theme.
  const variant =
    inProps.variant ?? shorthand ?? slideVariant ?? themeVariant ?? 'reveal';
  const appearances = rankAppearances(theme, appearancesOf(theme, variant));
  const together = use(TogetherContext);
  const step = useStep({
    with: together ?? withStep,
    group,
    in: parent,
    after,
    title,
    appearances,
  });
  const { ref, phase, inherited } = step;
  // Elements inside a step already look like it, e.g., hidden or dimmed.
  const appearance = moreHidden(
    moreHidden(appearances[phase], inherited),
    enclosing,
  );
  return (
    <StepRoot
      as={component}
      ref={ref}
      className={classNames(
        stepClasses.root,
        stepClasses[phase],
        appearanceClass('SliderStep', appearance, enclosing),
        className,
      )}
      ownerState={{ ...props, variant, phase }}
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
