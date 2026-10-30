import { createContext, type Context } from 'react';

import { StateStore, type StateOwner } from './StateStore.ts';

/** The stores of the state of a deck and its slides. */
export interface StateStores {
  /** Holds the state of the deck, owned by `'deck'`. */
  deck: StateStore;
  /** Holds the state of the slides, owned by the index of the slide. */
  slides: StateStore;
  /** Holds the state of one visit to the slides, owned by the index of the view. */
  visit: StateStore;
  /**
   * Records that the slide of a view reads a value of `deck` or `slides`,
   * including reads in probes and mirrors, e.g., to update its thumbnail.
   */
  recordUse?:
    | ((
        viewIndex: number,
        owner: StateOwner,
        family: object,
        key: string,
      ) => void)
    | undefined;
}

/** Creates stores in which the deck and its slides share a store. */
export function createStateStores(): StateStores {
  const state = new StateStore();
  return { deck: state, slides: state, visit: new StateStore() };
}

/**
 * The state of the enclosing deck. Outside of a deck, components share stores
 * of their own.
 */
export const StateStoresContext: Context<StateStores> =
  createContext(createStateStores());
