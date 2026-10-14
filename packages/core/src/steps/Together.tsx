import type { JSX, ReactNode } from 'react';

import { TogetherContext } from './TogetherContext.ts';
import { useStep, type StepState, type StepWith } from './useSteps.ts';

export interface TogetherProps {
  /** See {@link StepWith}. */
  with?: StepWith | undefined;
  children?: ReactNode | ((state: StepState) => ReactNode);
}

/**
 * Shows the {@link Step} components inside it as a single step, e.g., to
 * reveal several list items at once.
 *
 * Does not render any element: the elements of the step are those of the
 * `Step` components directly inside the group.
 */
export function Together({
  with: withStep,
  children,
}: TogetherProps): JSX.Element {
  const step = useStep({ with: withStep });
  return (
    <TogetherContext value={step}>
      {typeof children === 'function' ? children(step) : children}
    </TogetherContext>
  );
}
