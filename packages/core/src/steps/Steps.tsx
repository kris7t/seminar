import {
  styled,
  useThemeProps,
  type SxProps,
  type Theme,
} from '@mui/material/styles';
import type { ElementType, HTMLAttributes, JSX, ReactNode } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import {
  StepAppearanceContext,
  stepperClasses,
  type StepperClassKey,
} from './stepAppearance.ts';
import type { StepPhase } from './StepNode.ts';
import type { StepDefaults } from './stepDefaults.ts';
import type { OverlayProp, SplitProp } from './stepSplit.ts';
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
  /**
   * See {@link StepWith}, except for `'parent'`, which isn't a step, while this
   * takes several.
   */
  with?: Exclude<StepWith, 'parent'> | undefined;
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
  /**
   * How the steps ask for pages when the slide is split into pages, e.g., for
   * a PDF (see {@link SplitProp}). Defaults to `'each'`, since the content may
   * change in each step, e.g., `'none'` for steps that only highlight.
   */
  split?: SplitProp | undefined;
  /** See the `overlay` of `Step`. */
  overlay?: OverlayProp | undefined;
  /** The element to render. Defaults to `'div'`. */
  component?: ElementType;
  /** Content to render depending on the current step. */
  children?: ReactNode | ((state: StepState) => ReactNode);
  sx?: SxProps<Theme>;
}

// The content is always shown, but may change in each step.
const DEFAULTS: StepDefaults = { behavior: 'always', split: 'each' };

export type StepsClassKey = StepperClassKey;

export const stepsClasses: Record<StepsClassKey, string> =
  stepperClasses('SeminarSteps');

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarSteps: StepsClassKey;
  }

  interface ComponentsPropsList {
    SeminarSteps: StepsProps;
  }

  interface Components<Theme = unknown> {
    SeminarSteps?: ComponentTheme<'SeminarSteps', Theme> | undefined;
  }
}

interface StepsOwnerState extends StepsProps {
  stepIndex: number;
  phase: StepPhase;
}

const StepsRoot = styled('div', {
  name: 'SeminarSteps',
  slot: 'Root',
})<{ ownerState: StepsOwnerState }>({});

/**
 * Content that changes over `count` consecutive steps of the presentation,
 * e.g., to highlight parts of a figure one after another.
 *
 * Unlike {@link Step}, the content is always shown: pass a function as
 * `children` to render it depending on the current step.
 *
 * Can be themed as `SeminarSteps` in the `components` of the MUI theme.
 */
export function Steps(inProps: StepsProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarSteps' });
  const {
    count,
    component = 'div',
    with: withStep,
    group,
    in: parent,
    after,
    title,
    split,
    overlay,
    className,
    children,
    ...other
  } = props;
  const step = useSteps(count ?? 1, {
    with: withStep,
    group,
    in: parent,
    after,
    title,
    split,
    defaults: DEFAULTS,
    overlay,
  });
  const { ref, stepIndex, phase, appearance } = step;
  return (
    <StepsRoot
      as={component}
      ref={ref}
      className={classNames(
        stepsClasses.root,
        stepsClasses[phase],
        step.className,
        className,
      )}
      ownerState={{ ...props, stepIndex, phase }}
      {...other}
    >
      <StepAppearanceContext value={appearance}>
        {typeof children === 'function' ? children(step) : children}
      </StepAppearanceContext>
    </StepsRoot>
  );
}
