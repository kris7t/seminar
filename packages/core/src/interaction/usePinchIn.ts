import { useRef, type TouchEvent, type TouchEventHandler } from 'react';

/**
 * How much the fingers have to come together, relative to where they started,
 * to count as pinching in.
 */
const PINCH_RATIO = 0.6;

/** Tolerance for the zoom of the page to count as not zoomed in. */
const ZOOM_TOLERANCE = 0.01;

export interface PinchHandlers {
  onTouchStart: TouchEventHandler<HTMLElement>;
  onTouchMove: TouchEventHandler<HTMLElement>;
  onTouchEnd: TouchEventHandler<HTMLElement>;
  onTouchCancel: TouchEventHandler<HTMLElement>;
}

function distance(event: TouchEvent<HTMLElement>): number | undefined {
  const [a, b] = [event.touches[0], event.touches[1]];
  if (event.touches.length !== 2 || a === undefined || b === undefined) {
    return undefined;
  }
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function isZoomedIn(): boolean {
  return (window.visualViewport?.scale ?? 1) > 1 + ZOOM_TOLERANCE;
}

/**
 * Calls `onPinchIn` when two fingers come together, like zooming out, on a
 * touch screen.
 *
 * The browser may zoom the page with the same gesture, which cancels the
 * pointer events, so this listens to touch events, which keep coming. If the
 * page is zoomed in, pinching in zooms it out instead.
 */
export function usePinchIn(
  onPinchIn: () => void,
  disabled = false,
): PinchHandlers {
  /** Distance of the fingers when the pinch started. */
  const startRef = useRef<number>(undefined);
  const reset = () => {
    startRef.current = undefined;
  };
  return {
    onTouchStart: (event) => {
      startRef.current = disabled || isZoomedIn() ? undefined : distance(event);
    },
    onTouchMove: (event) => {
      const start = startRef.current;
      const current = distance(event);
      if (start === undefined || current === undefined) {
        return;
      }
      if (current < start * PINCH_RATIO) {
        reset();
        onPinchIn();
      }
    },
    onTouchEnd: reset,
    onTouchCancel: reset,
  };
}
