import { createContext, type Context } from 'react';

import type { StepBehavior } from './Step.tsx';

/**
 * The behavior of the steps on a slide that don't set their own, e.g., from
 * the `steps` prop of the slide.
 */
export const StepBehaviorContext: Context<StepBehavior | undefined> =
  createContext<StepBehavior | undefined>(undefined);
