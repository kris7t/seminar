import { createContext, type Context } from 'react';

import { StepStore } from './StepStore.ts';

/**
 * The step store of the enclosing deck.
 *
 * Outside of a deck, slides are shown at their last step, as when going back
 * to them.
 */
export const StepStoreContext: Context<StepStore> = createContext(
  new StepStore({ toEnd: true }),
);
