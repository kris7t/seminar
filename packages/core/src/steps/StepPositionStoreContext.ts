import { createContext, use, type Context } from 'react';

import type { StepPositionStore } from './StepPositionStore.ts';

/** The positions in the steps of the slides of the enclosing deck. */
export const StepPositionStoreContext: Context<StepPositionStore | undefined> =
  createContext<StepPositionStore | undefined>(undefined);

/** Returns the positions in the steps of the slides of the enclosing deck. */
export function useStepPositions(): StepPositionStore {
  const store = use(StepPositionStoreContext);
  if (store === undefined) throw new Error('Mirrors of slides require a Deck');
  return store;
}
