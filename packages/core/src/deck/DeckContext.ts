import { createContext, use, type Context } from 'react';

import type { ResolvedTocEntry } from '../toc/tableOfContents.ts';
import type { GoToSteps } from './useDeckNavigation.ts';

export interface DeckState {
  /** Zero-based index of the currently shown slide. */
  slideIndex: number;
  slideCount: number;
  /** Whether no steps of the current slide are shown. */
  atFirstStep: boolean;
  /** Whether all steps of the current slide are shown. */
  atLastStep: boolean;
  /**
   * Goes to a slide. `steps` sets which of its steps are shown:
   *
   * - `'start'` (the default): none.
   * - `'end'`: all of them.
   * - `'restore'`: those last shown on the slide, or none if it hasn't been
   *   shown yet.
   */
  goTo: (slideIndex: number, steps?: GoToSteps) => void;
  /** Goes to the next step, or to the next slide after the last step. */
  next: () => void;
  /**
   * Goes to the previous step, or to the last step of the previous slide
   * before the first step.
   */
  previous: () => void;
  /**
   * Goes to the next slide, skipping any steps, and shows the steps last shown
   * on it (or none if it hasn't been shown yet).
   */
  nextSlide: () => void;
  /**
   * Goes to the previous slide, skipping any steps, and shows the steps last
   * shown on it.
   */
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
  /** The table of contents of the deck, which may be empty. */
  toc: ResolvedTocEntry[];
  /** Whether the table of contents is shown in a sidebar. */
  showToc: boolean;
  setShowToc: (shown: boolean) => void;
  /** Whether the steps of the current slide are shown in a sidebar. */
  showSteps: boolean;
  setShowSteps: (shown: boolean) => void;
  /** Whether all slides are shown in a grid to select one. */
  showOverview: boolean;
  /**
   * Shows or hides the overview. When shown, the current slide is selected
   * in it.
   */
  setShowOverview: (shown: boolean) => void;
  /**
   * The slide selected in the overview, which only becomes the current slide
   * once it is chosen.
   */
  overviewIndex: number;
  setOverviewIndex: (slideIndex: number) => void;
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
