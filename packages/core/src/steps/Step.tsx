import { generateUtilityClasses } from '@mui/material';
import {
  styled,
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
import type { StepPhase } from './StepStore.ts';
import { StepVariantContext } from './StepVariantContext.ts';
import { TogetherContext } from './TogetherContext.ts';
import { useStep, type StepState, type StepWith } from './useSteps.ts';

/**
 * Further variants of steps, which themes can add to the `variants` of
 * `SliderStep` in the `components` of the MUI theme. Add them by module
 * augmentation, e.g., `interface StepVariantOverrides { fancy: true }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface StepVariantOverrides {}

/**
 * How a step looks before, while, and after it's the current step:
 *
 * | Variant  | future | current, parent | past   |
 * | -------- | ------ | --------------- | ------ |
 * | `reveal` | hidden | shown           | shown  |
 * | `dim`    | hidden | shown           | dimmed |
 * | `preview`| dimmed | shown           | shown  |
 * | `focus`  | dimmed | shown           | dimmed |
 * | `only`   | hidden | shown           | hidden |
 *
 * See {@link StepPhase} for the phases. Variants added by themes (see
 * {@link StepVariantOverrides}) look like `reveal` unless the theme styles
 * them otherwise.
 */
export type StepVariant =
  | 'reveal'
  | 'dim'
  | 'preview'
  | 'focus'
  | 'only'
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof StepVariantOverrides;

type Appearance = 'hidden' | 'dimmed' | 'shown';

const APPEARANCES: Readonly<
  Record<string, Readonly<Record<StepPhase, Appearance>>>
> = {
  reveal: {
    future: 'hidden',
    current: 'shown',
    parent: 'shown',
    past: 'shown',
  },
  dim: { future: 'hidden', current: 'shown', parent: 'shown', past: 'dimmed' },
  preview: {
    future: 'dimmed',
    current: 'shown',
    parent: 'shown',
    past: 'shown',
  },
  focus: {
    future: 'dimmed',
    current: 'shown',
    parent: 'shown',
    past: 'dimmed',
  },
  only: { future: 'hidden', current: 'shown', parent: 'shown', past: 'hidden' },
};

function appearanceOf(variant: StepVariant, phase: StepPhase): Appearance {
  return (APPEARANCES[variant] ?? APPEARANCES['reveal'])?.[phase] ?? 'shown';
}

/** How long steps take to appear, disappear, or dim, in milliseconds. */
const TRANSITION_DURATION = 150;

export interface StepProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /**
   * See {@link StepWith}. Ignored directly inside a {@link Together}, which
   * determines the step instead.
   */
  with?: StepWith | undefined;
  /** See the `group` option of `useSteps`. */
  group?: string | undefined;
  /**
   * How the step looks in its phases. Defaults to the `steps` of the slide,
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
  ['root', 'future', 'current', 'parent', 'past', 'hidden', 'dimmed'],
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
  // Steps inside a dimmed step are already dimmed with it.
  [`.${stepClasses.dimmed} &.${stepClasses.dimmed}`]: { opacity: 1 },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
});

/**
 * Content shown from a step of the presentation.
 *
 * Its `variant` determines how it looks before, while, and after it's the
 * current step (see {@link StepVariant}). Hidden steps keep their space in the
 * layout. Steps inside the step are nested inside it, and are shown after it.
 *
 * Can be themed as `SliderStep` in the `components` of the MUI theme. The step
 * has a class for its phase (`SliderStep-future`, `-current`, `-parent`, or
 * `-past`, see {@link StepPhase}), and `SliderStep-hidden` or
 * `SliderStep-dimmed` if it's hidden or dimmed. The opacity of dimmed steps is
 * the `--SliderStep-dim-opacity` custom property. Steps inside a dimmed step
 * aren't dimmed again. Themes can add variants to `variants` (see
 * {@link StepVariantOverrides}), e.g., `{ props: { variant: 'fancy' }, style:
 * { '&.SliderStep-current': { color: 'red' } } }`.
 */
export function Step(inProps: StepProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderStep' });
  const slideVariant = use(StepVariantContext);
  const {
    component = 'div',
    with: withStep,
    group,
    variant: themeVariant,
    className,
    children,
    ...other
  } = props;
  // The variant of the slide takes precedence over the default of the theme.
  const variant = inProps.variant ?? slideVariant ?? themeVariant ?? 'reveal';
  const together = use(TogetherContext);
  const step = useStep({ with: together ?? withStep, group });
  const { ref, phase } = step;
  const appearance = appearanceOf(variant, phase);
  return (
    <StepRoot
      as={component}
      ref={ref}
      className={classNames(
        stepClasses.root,
        stepClasses[phase],
        appearance === 'shown' ? undefined : stepClasses[appearance],
        className,
      )}
      ownerState={{ ...props, variant, phase }}
      {...other}
    >
      {/* Steps nested inside this one don't join the enclosing Together. */}
      <TogetherContext value={undefined}>
        {typeof children === 'function' ? children(step) : children}
      </TogetherContext>
    </StepRoot>
  );
}
