import { createContext, type Context } from 'react';

import { DeckStateStore } from './DeckStateStore.ts';

/**
 * The state of the enclosing deck. Outside of a deck, components share a
 * store of their own.
 */
export const DeckStateContext: Context<DeckStateStore> = createContext(
  new DeckStateStore(),
);
