import { createContext, type Context } from 'react';

import { StepPositionStore } from './StepPositionStore.ts';

/**
 * The positions in the steps of the slides of the enclosing deck. Outside of a
 * deck, slides share a store of their own.
 */
export const StepPositionStoreContext: Context<StepPositionStore> =
  createContext(new StepPositionStore());
