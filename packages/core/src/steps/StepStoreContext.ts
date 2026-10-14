import { createContext, type Context } from 'react';

import { StepStore } from './StepStore.ts';

/**
 * The step store of the enclosing deck.
 *
 * Outside of a deck, all steps are shown.
 */
export const StepStoreContext: Context<StepStore> = createContext(
  new StepStore({ showAll: true }),
);
