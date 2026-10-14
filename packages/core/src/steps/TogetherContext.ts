import { createContext, type Context } from 'react';

import type { StepHandle } from './useSteps.ts';

/**
 * The step of the enclosing {@link Together}, which {@link Step} components
 * directly inside it join instead of creating their own step.
 */
export const TogetherContext: Context<StepHandle | undefined> = createContext<
  StepHandle | undefined
>(undefined);
