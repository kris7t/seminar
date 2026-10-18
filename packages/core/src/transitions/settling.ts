import { use, useCallback, useEffectEvent, useLayoutEffect } from 'react';

import { SlideTransitionsContext } from './SlideTransitions.ts';

/** Options of {@link useTransitionHold}. */
export interface TransitionHoldOptions {
  /**
   * How long a change of the slide may wait for this component, in
   * milliseconds from the change, if it needs longer than other components,
   * e.g., to load something. The greatest deadline among the components that
   * hold the change counts, up to a few seconds.
   */
  deadline?: number | undefined;
}

/**
 * Keeps showing the slide as it was before a change, e.g., to the slide of
 * this component or to another step, while `pending`, so that the component
 * doesn't flash in an unfinished state, e.g., while it loads or measures
 * something. Once the component is ready, or the deadline passes, the slide
 * cuts or fades to the change.
 *
 * Only changes that are rendered while the component is pending wait for it,
 * so a component that stays pending doesn't hold up later changes. Content
 * that the slides wait for anyway doesn't need holding: images, fonts, and
 * renders set off by the change, e.g., in effects.
 */
export function useTransitionHold(
  pending: boolean,
  { deadline }: TransitionHoldOptions = {},
): void {
  const transitions = use(SlideTransitionsContext);
  useLayoutEffect(
    () => (pending ? transitions.hold(deadline) : undefined),
    [transitions, pending, deadline],
  );
}

/**
 * Returns a function that changes the slide with `update`, e.g., to set the
 * state of a component when it's clicked, and keeps showing the slide as it
 * was until the changed slide is ready, like changes of the slide or its
 * step do. Components that aren't ready yet hold the change with
 * {@link useTransitionHold}, so that the slide doesn't flash in an
 * unfinished state, e.g., while a formula renders. The slide cuts to the
 * change, without fading.
 *
 * `update` may run later, but before any later update or change of the
 * slide, which shows the update right away, if it's still waiting. Updates
 * that come in quick succession, e.g., for each key pressed, should set state
 * as usual instead. Without view transitions, `update` runs at once.
 */
export function useSlideUpdate(): (update: () => void) => void {
  const transitions = use(SlideTransitionsContext);
  return useCallback(
    (update: () => void) => {
      transitions.run(update, 'step', 0);
    },
    [transitions],
  );
}

/**
 * Calls `measure` once `element` is rendered, and whenever it may have
 * changed size: when it's resized, when the window is resized, and while a
 * change of the slide waits for it to settle, when browsers don't tell resize
 * observers. `measure` should set state only if what it measures changed.
 */
export function useMeasure(
  element: Element | null | undefined,
  measure: () => void,
): void {
  const transitions = use(SlideTransitionsContext);
  const onMeasure = useEffectEvent(measure);
  useLayoutEffect(() => {
    onMeasure();
    if (element === null || element === undefined) {
      return undefined;
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            onMeasure();
          });
    observer?.observe(element);
    const view = element.ownerDocument.defaultView;
    const onResize = () => {
      onMeasure();
    };
    view?.addEventListener('resize', onResize);
    const unsubscribe = transitions.subscribeToMeasure(onResize);
    return () => {
      observer?.disconnect();
      view?.removeEventListener('resize', onResize);
      unsubscribe();
    };
  }, [element, transitions]);
}
