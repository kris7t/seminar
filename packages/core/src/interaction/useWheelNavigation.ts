import {
  useCallback,
  useEffect,
  useRef,
  type WheelEvent,
  type WheelEventHandler,
} from 'react';

import { getInteraction } from './interaction.ts';

/** How far to scroll to go to another step, in pixels. */
export const WHEEL_THRESHOLD = 40;

/**
 * How much further to scroll to go to each further step without resting, in
 * pixels, about one notch of a mouse wheel.
 */
export const WHEEL_STEP = 100;

/**
 * How long the wheel must rest to start a new scroll, in milliseconds.
 */
export const WHEEL_REST = 200;

/** Pixels per line, for wheels that scroll by lines. */
const LINE_HEIGHT = 16;

/** Returns the vertical distance of a wheel event in pixels. */
function pixelsOf(event: WheelEvent<HTMLElement>): number {
  switch (event.deltaMode) {
    case 1: // Lines.
      return event.deltaY * LINE_HEIGHT;
    case 2: // Pages.
      return event.deltaY * event.currentTarget.clientHeight;
    default:
      return event.deltaY;
  }
}

/**
 * Whether an element between `target` and `container` can scroll in the
 * direction of `delta`, so that the wheel should scroll it instead.
 */
function canScroll(
  target: EventTarget,
  container: HTMLElement,
  delta: number,
): boolean {
  for (
    let element = target instanceof Element ? target : null;
    element !== null && element !== container;
    element = element.parentElement
  ) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY !== 'auto' && overflowY !== 'scroll') {
      continue;
    }
    const canScrollDown =
      element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    const canScrollUp = element.scrollTop > 0;
    if (delta > 0 ? canScrollDown : canScrollUp) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a wheel handler that goes to the next step when scrolling down, and
 * to the previous step when scrolling up.
 *
 * Scrolling adds up until it reaches {@link WHEEL_THRESHOLD}, so that small
 * movements on a trackpad don't navigate, and then goes another step every
 * {@link WHEEL_STEP}, about one notch of a mouse wheel, until the wheel rests
 * for {@link WHEEL_REST}. So flicking the wheel goes several steps.
 *
 * Elements that can scroll in the direction of the wheel are scrolled instead,
 * until the wheel rests, even if they reach the end of their content. The wheel is ignored on interactive elements (see
 * {@link getInteraction}), with Ctrl (which zooms, also when pinching on a
 * trackpad), and when scrolling mostly sideways.
 */
export function useWheelNavigation(
  next: () => void,
  previous: () => void,
): WheelEventHandler<HTMLElement> {
  const distanceRef = useRef(0);
  /** Whether the scroll already went to another step. */
  const steppedRef = useRef(false);
  /** Whether the scroll scrolls an element instead. */
  const lockedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
    },
    [],
  );
  return useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        getInteraction(event.target) !== undefined
      ) {
        return;
      }
      // Wait until the wheel rests.
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lockedRef.current = false;
        steppedRef.current = false;
        distanceRef.current = 0;
      }, WHEEL_REST);
      if (canScroll(event.target, event.currentTarget, event.deltaY)) {
        // Don't go on to another step when the scrolling reaches the end.
        lockedRef.current = true;
        return;
      }
      if (lockedRef.current) {
        return;
      }
      const delta = pixelsOf(event);
      // Start over when the direction changes.
      distanceRef.current =
        Math.sign(delta) === Math.sign(distanceRef.current)
          ? distanceRef.current + delta
          : delta;
      const needed = steppedRef.current ? WHEEL_STEP : WHEEL_THRESHOLD;
      if (Math.abs(distanceRef.current) < needed) {
        return;
      }
      const forward = distanceRef.current > 0;
      distanceRef.current = 0;
      steppedRef.current = true;
      if (forward) {
        next();
      } else {
        previous();
      }
    },
    [next, previous],
  );
}
