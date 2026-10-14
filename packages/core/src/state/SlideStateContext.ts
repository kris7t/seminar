import { createContext, type Context } from 'react';

import { SlideStateStore } from './SlideStateStore.ts';

/**
 * The shared state of the slides of the enclosing deck. Outside of a deck,
 * slides share a store of their own.
 */
export const SlideStateContext: Context<SlideStateStore> = createContext(
  new SlideStateStore(),
);
