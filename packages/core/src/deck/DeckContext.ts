import { createContext, use, type Context } from 'react';

export interface DeckState {
  /** Zero-based index of the currently shown slide. */
  slideIndex: number;
  slideCount: number;
  /** Goes to the beginning of a slide. */
  goTo: (slideIndex: number) => void;
  /** Goes to the next step, or to the next slide after the last step. */
  next: () => void;
  /**
   * Goes to the previous step, or to the last step of the previous slide
   * before the first step.
   */
  previous: () => void;
  /** Goes to the beginning of the next slide, skipping any steps. */
  nextSlide: () => void;
  /** Goes to the beginning of the previous slide, skipping any steps. */
  previousSlide: () => void;
  /** Goes to the first step of the current slide. */
  firstStep: () => void;
  /**
   * Goes to the last step of the current slide, showing all steps on the
   * slide.
   */
  lastStep: () => void;
  /**
   * Whether clicking on the slides navigates. If disabled, text on the slides
   * can be selected instead.
   */
  mouseNavigation: boolean;
  setMouseNavigation: (enabled: boolean) => void;
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
