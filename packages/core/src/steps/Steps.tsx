import { generateUtilityClasses } from '@mui/material';
import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { ElementType, HTMLAttributes, JSX, ReactNode } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
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
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  /** Content to render depending on the current step. */
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

export type StepsClassKey = 'root' | StepPhase;

export const stepsClasses: Record<StepsClassKey, string> =
  generateUtilityClasses('SliderSteps', [
    'root',
    'future',
    'current',
    'parent',
    'past',
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
})<{ ownerState: StepsOwnerState }>({});

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
    className,
    children,
    ...other
  } = props;
  const step = useSteps(count ?? 1, { with: withStep, group });
  const { ref, stepIndex, phase } = step;
  return (
    <StepsRoot
      as={component}
      ref={ref}
      className={classNames(stepsClasses.root, stepsClasses[phase], className)}
      ownerState={{ ...props, stepIndex, phase }}
      {...other}
    >
      <TogetherContext value={undefined}>
        {typeof children === 'function' ? children(step) : children}
      </TogetherContext>
    </StepsRoot>
  );
}
