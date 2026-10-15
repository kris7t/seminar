import { createContext, type Context } from 'react';

import type { StepVariant } from './Step.tsx';

/**
 * The variant of the steps on a slide that don't set their own, e.g., from
 * the `steps` prop of the slide.
 */
export const StepVariantContext: Context<StepVariant | undefined> =
  createContext<StepVariant | undefined>(undefined);
