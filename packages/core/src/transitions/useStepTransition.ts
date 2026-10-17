import { useTheme } from '@mui/material/styles';
import { use, useSyncExternalStore } from 'react';

import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { compareStepPaths } from '../steps/stepRange.ts';
import {
  getFadeTransition,
  SlideTransitionsContext,
} from './SlideTransitions.ts';
import { useSlideView } from '../view/SlideViewContext.ts';

/** How the slide changes to its current step, see {@link useStepTransition}. */
export interface StepTransition {
  /**
   * How long the slide fades to the current step, in milliseconds, or 0 if it
   * changed at once, e.g., because the step cuts, or the view doesn't
   * animate.
   */
  duration: number;
  /** The CSS easing function of the fade. */
  easing: string;
  /** Whether the slide went to a later step. */
  forward: boolean;
  /**
   * Whether the views show the current step, so that animations of the
   * component's own can start. It's `false` while the views still show the
   * slide as it was, until the changed slide is ready, e.g., while a
   * component holds the change. CSS transitions and animations that the
   * change starts wait for it by themselves.
   */
  shown: boolean;
  /**
   * Whether the change to the current step was cut short, e.g., because the
   * presenter went on before it ended, so animations of the component's own
   * should jump to their end. CSS transitions and animations that the change
   * started end by themselves.
   */
  skipped: boolean;
}

/**
 * Returns how the slide fades to its current step, so that components that
 * animate when the step changes can animate along, e.g., with
 * `transition: transform ${duration}ms ${easing}`. The duration follows the
 * fades of the steps, the slide, and the theme, even in browsers where the
 * slide cuts instead of fading. It's 0 where the step changes at once: for
 * cuts, in views that don't animate (see `animated` of `useSlideView`), and
 * when the deck jumps to a step, e.g., from the step tree. It doesn't change
 * while the step is shown: see `shown` and `skipped` for that.
 */
export function useStepTransition(): StepTransition {
  const transitions = use(SlideTransitionsContext);
  const change = useSyncExternalStore(
    transitions.subscribeToChanges,
    transitions.getChange,
    transitions.getChange,
  );
  const { animated, index } = useSlideView();
  const store = use(StepStoreContext);
  const path = useSyncExternalStore(
    store.subscribe,
    store.getPath,
    store.getPath,
  );
  const theme = useTheme();
  // Only the change that led to the current step of this slide counts.
  const current =
    change?.kind === 'step' &&
    change.slideIndex === index &&
    change.path !== undefined &&
    compareStepPaths(change.path, path) === 0
      ? change
      : undefined;
  return {
    duration: animated && current !== undefined ? current.duration : 0,
    easing: getFadeTransition(theme, 'step').easing,
    forward: current?.forward ?? true,
    shown: !animated || current?.shown !== false,
    skipped: current?.skipped === true,
  };
}
