import { createContext, type Context } from 'react';

import type { SharedWorkStore } from './SharedWorkStore.ts';

/** Work shared by the slides and views of the enclosing Deck. */
export const SharedWorkContext: Context<SharedWorkStore | undefined> =
  createContext<SharedWorkStore | undefined>(undefined);
