import { createContext, use, type Context } from 'react';

/**
 * Where a slide is rendered. A deck may render the same slide in several
 * views at once, e.g., in the overview, and later in a presenter view, so
 * slides should render the same content in every view, maybe styled
 * differently.
 *
 * - `'audience'`: the slide shown to the audience, i.e., the normal view of
 *   the deck.
 * - `'thumbnail'`: a small preview of the slide, e.g., in the overview of the
 *   slides, where it shows all of its steps.
 */
export type SlideViewKind = 'audience' | 'thumbnail';

/** A rendering of a slide. See {@link useSlideView}. */
export interface SlideView {
  /** Zero-based index of the slide in the deck. */
  index: number;
  kind: SlideViewKind;
  /**
   * Whether the presenter interacts with the slide in this view. Other views
   * are inert, so expensive or interactive content, like code editors, may
   * render a lighter preview in them.
   */
  interactive: boolean;
}

const DEFAULT_VIEW: SlideView = {
  index: 0,
  kind: 'audience',
  interactive: true,
};

export const SlideViewContext: Context<SlideView> =
  createContext<SlideView>(DEFAULT_VIEW);

/**
 * Returns the view the enclosing slide is rendered in. Outside of a deck, the
 * slide is assumed to be the first slide of an interactive audience view.
 */
export function useSlideView(): SlideView {
  return use(SlideViewContext);
}

/** The data attribute of the element of a slide view with its kind. */
export const SLIDE_VIEW_ATTRIBUTE = 'data-slider-view';
