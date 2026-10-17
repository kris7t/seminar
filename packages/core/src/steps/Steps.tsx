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
import { classNames } from '../theme/classNames.ts';
import {
  ALWAYS_SHOWN,
  appearanceClass,
  moreHidden,
  StepAppearanceContext,
} from './stepAppearance.ts';
import type { StepPhase } from './StepStore.ts';
import { TogetherContext } from './TogetherContext.ts';
import { useSteps, type StepState, type StepWith } from './useSteps.ts';

export interface StepsProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /**
   * Number of consecutive steps. Required unless `with` is a
   * {@link StepHandle}, whose number of steps is used instead.
   */
  count?: number | undefined;
  /** See {@link StepWith}. */
  with?: StepWith | undefined;
  /** See the `group` option of {@link useSteps}. */
  group?: string | undefined;
  /** See the `in` option of {@link useSteps}. */
  in?: string | Element | undefined;
  /** See the `after` option of `useSteps`. */
  after?: string | undefined;
  /**
   * Title of the step in the tree of steps, instead of its text. Unlike the
   * HTML attribute, it isn't shown as a tooltip.
   */
  title?: string | undefined;
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  /** Content to render depending on the current step. */
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

export type StepsClassKey =
  'root' | StepPhase | 'hidden' | 'dimmed' | 'collapsed';

export const stepsClasses: Record<StepsClassKey, string> =
  generateUtilityClasses('SliderSteps', [
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
  ]);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderSteps: StepsClassKey;
  }

  interface ComponentsPropsList {
    SliderSteps: StepsProps;
  }

  interface Components<Theme = unknown> {
    SliderSteps?: ComponentTheme<'SliderSteps', Theme> | undefined;
  }
}

interface StepsOwnerState extends StepsProps {
  stepIndex: number;
  phase: StepPhase;
}

const StepsRoot = styled('div', {
  name: 'SliderSteps',
  slot: 'Root',
})<{ ownerState: StepsOwnerState }>({
  // Like `Step`, for content nested in hidden or dimmed steps with `in`.
  [`&.${stepsClasses.hidden}`]: { visibility: 'hidden' },
  [`&.${stepsClasses.dimmed}`]: {
    opacity: 'var(--SliderStep-dim-opacity, 0.35)',
  },
  [`&.${stepsClasses.collapsed}`]: { display: 'none' },
});

/**
 * Content that changes over `count` consecutive steps of the presentation,
 * e.g., to highlight parts of a figure one after another.
 *
 * Unlike {@link Step}, the content is always shown: pass a function as
 * `children` to render it depending on the current step.
 *
 * Can be themed as `SliderSteps` in the `components` of the MUI theme.
 */
export function Steps(inProps: StepsProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderSteps' });
  const {
    count,
    component = 'div',
    with: withStep,
    group,
    in: parent,
    after,
    title,
    className,
    children,
    ...other
  } = props;
  const enclosing = use(StepAppearanceContext);
  const step = useSteps(count ?? 1, {
    with: withStep,
    group,
    in: parent,
    after,
    title,
    appearances: ALWAYS_SHOWN,
  });
  const { ref, stepIndex, phase, inherited } = step;
  // The content is always shown, unless the step it is nested in isn't.
  const appearance = moreHidden(inherited, enclosing);
  return (
    <StepsRoot
      as={component}
      ref={ref}
      className={classNames(
        stepsClasses.root,
        stepsClasses[phase],
        appearanceClass('SliderSteps', appearance, enclosing),
        className,
      )}
      ownerState={{ ...props, stepIndex, phase }}
      {...other}
    >
      <StepAppearanceContext value={appearance}>
        <TogetherContext value={undefined}>
          {typeof children === 'function' ? children(step) : children}
        </TogetherContext>
      </StepAppearanceContext>
    </StepsRoot>
  );
}
