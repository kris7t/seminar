import { createContext, use, type Context } from 'react';

export interface DeckState {
  /** Zero-based index of the currently shown slide. */
  slideIndex: number;
  slideCount: number;
  goTo: (slideIndex: number) => void;
  next: () => void;
  previous: () => void;
}

export const DeckContext: Context<DeckState | undefined> = createContext<
  DeckState | undefined
>(undefined);

/** Returns the state of the enclosing {@link Deck}. */
export function useDeck(): DeckState {
  const deck = use(DeckContext);
  if (deck === undefined) {
    throw new Error('useDeck must be used inside a Deck');
  }
  return deck;
}
