import { createContext, use, useSyncExternalStore, type Context } from 'react';

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
   * Whether the presenter interacts with the slide in this view, i.e., the
   * slide of the deck window, which is the presenter view while presenting.
   * Other views are inert: e.g., the audience window mirrors the slide, and
   * doesn't take input. So expensive work, like a simulation, should run in
   * this view, and share its results with the others through slide state.
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

/** A rendering of a slide, with flags for what it's for. */
export interface SlideViewState extends SlideView {
  /**
   * Whether the slide is being presented in this view, at the current step,
   * i.e., in the `audience` or `presenter` view, which should show it in full
   * fidelity. Other views show a step as it ends, or aren't shown at all.
   */
  presented: boolean;
  /**
   * Whether the view is shown, i.e., anything but a `probe`, so that the
   * slide has to render more than its steps.
   */
  visible: boolean;
  /**
   * Whether the slide should animate in this view: it's being presented, and
   * the viewer doesn't prefer reduced motion. Components that animate when
   * the step changes should check this.
   */
  animated: boolean;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Returns the media query of reduced motion, if there are media queries. */
function reducedMotionQuery(): MediaQueryList | undefined {
  // Not every environment has media queries, e.g., jsdom.
  return 'matchMedia' in window ? window.matchMedia(REDUCED_MOTION) : undefined;
}

function subscribeToReducedMotion(listener: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener('change', listener);
  return () => {
    query?.removeEventListener('change', listener);
  };
}

function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/**
 * Returns the view the enclosing slide is rendered in. Outside of a deck, the
 * slide is assumed to be the first slide of an interactive audience view.
 */
export function useSlideView(): SlideViewState {
  const view = use(SlideViewContext);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const presented = view.kind === 'audience' || view.kind === 'presenter';
  return {
    ...view,
    presented,
    visible: view.kind !== 'probe',
    animated: presented && !reducedMotion,
  };
}

/** The data attribute of the element of a slide view with its kind. */
export const SLIDE_VIEW_ATTRIBUTE = 'data-seminar-view';
