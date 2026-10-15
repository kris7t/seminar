import { createContext, use, type Context } from 'react';

/**
 * Where a slide is rendered. A deck may render the same slide in several
 * views at once, e.g., in the overview, and later in a presenter view, so
 * slides should render the same content in every view, maybe styled
 * differently.
 *
 * - `'audience'`: the slide shown to the audience, i.e., the normal view of
 *   the deck, or the audience window of the presenter view.
 * - `'presenter'`: the slide the presenter interacts with while the audience
 *   window shows it to the audience.
 * - `'thumbnail'`: a small preview of the slide, e.g., in the overview of the
 *   slides, showing the steps last shown on it.
 * - `'preview'`: the next or previous slide coming into view next to the
 *   audience view while swiping between slides, showing the steps last shown
 *   on it.
 * - `'probe'`: a rendering that is never shown, which finds the steps of the
 *   slide, e.g., to mark the slides with steps in the table of contents. Its
 *   elements are in a document without a window, so they don't load images,
 *   media, or frames, and it has state of its own. Slides should still render
 *   their steps in it, but may leave out anything else that is expensive to
 *   set up, like connections or timers.
 */
export type SlideViewKind =
  'audience' | 'presenter' | 'thumbnail' | 'preview' | 'probe';

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
  /**
   * Index of the slide whose state the slide shares, e.g., the slide that a
   * recap recaps. Defaults to `index`.
   */
  stateIndex?: number | undefined;
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
