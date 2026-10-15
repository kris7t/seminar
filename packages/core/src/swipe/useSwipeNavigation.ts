import { useMediaQuery } from '@mui/material';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEvent,
  type PointerEventHandler,
} from 'react';

import { getInteraction, TOUCH_SLOP } from '../interaction/interaction.ts';

/** Fraction of the width a slow swipe has to cover to change the slide. */
const DISTANCE_THRESHOLD = 0.25;

/** Speed of a fling that changes the slide, in pixels per millisecond. */
const FLING_VELOCITY = 0.4;

/** Minimum distance of a fling, so that small jerks don't count, in pixels. */
const FLING_DISTANCE = 30;

/**
 * How fast the slide follows the finger while it resists being swiped past its
 * steps, relative to the finger.
 */
const RESISTANCE = 0.25;

/**
 * Fraction of the width the finger has to cover before the slide starts to
 * break through the resistance of its steps.
 */
const BREAK_START = 0.15;

/**
 * Fraction of the width the finger covers while the slide breaks through and
 * catches up with it. Breaking through ends at {@link DISTANCE_THRESHOLD}, so
 * a slide that gave way goes to the next one when let go.
 */
const BREAK_LENGTH = DISTANCE_THRESHOLD - BREAK_START;

/**
 * Fraction of the width the slide moves at most at the first or last slide.
 */
const EDGE_LIMIT = 0.08;

/** How long the samples for the velocity are kept, in milliseconds. */
const VELOCITY_WINDOW = 100;

/** How long the hint about more steps stays after letting go, in ms. */
const HINT_DURATION = 2500;

/** How long the slides take to settle after letting go, in ms. */
export const SETTLE_DURATION = 200;

/** How long the slides take to slide in after changing the slide, in ms. */
export const ENTER_DURATION = 250;

/**
 * How long to wait after a transition or animation should have ended before
 * assuming it did, since the browser doesn't report it if it was interrupted
 * or nothing had to move, in ms.
 */
const END_GRACE = 100;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface SwipeHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  /** Keeps the click that may end a swipe from navigating. */
  onClickCapture: MouseEventHandler<HTMLElement>;
}

export interface SwipeNavigationOptions {
  /** Whether there are more steps on the current slide. */
  hasMoreSteps: () => boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  nextSlide: () => void;
  previousSlide: () => void;
  /** Width of the area of the slides, in pixels. */
  width: number;
  /**
   * Whether swiping is disabled, e.g., because a menu is open. Disabling it
   * stops the current swipe.
   */
  disabled?: boolean;
}

export interface SwipeNavigation {
  handlers: SwipeHandlers;
  /** Horizontal offset of the slides, in pixels. */
  offset: number;
  /**
   * How the offset should change: `'none'` if the slides follow the finger,
   * and `'settle'` if they settle after letting go.
   */
  transition: 'none' | 'settle';
  /**
   * Where the slides should slide in from after a swipe changed the slide, in
   * pixels, or `undefined` if they shouldn't.
   */
  enterFrom: number | undefined;
  /**
   * Whether the slides are moving, so that the next and previous slides
   * should be shown next to the current one.
   */
  moving: boolean;
  /** Should be called when a transition of the offset has ended. */
  onTransitionEnd: () => void;
  /** Should be called when the slides have slid in. */
  onAnimationEnd: () => void;
  /**
   * Whether to tell that the current slide has more steps, because the
   * presenter is swiping past them.
   */
  showHint: boolean;
}

interface Sample {
  x: number;
  time: number;
}

interface Swipe {
  pointerId: number;
  startX: number;
  startY: number;
  /** `undefined` until the touch moves far enough to tell its direction. */
  horizontal: boolean | undefined;
  /** Whether swiping forward has to overcome the steps of the slide. */
  resisted: boolean;
  samples: Sample[];
}

function velocityOf(samples: readonly Sample[]): number {
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined || last.time <= first.time) {
    return 0;
  }
  return (last.x - first.x) / (last.time - first.time);
}

/** Moves less and less as `dx` grows, but never more than `limit`. */
function rubberBand(dx: number, limit: number): number {
  return Math.sign(dx) * limit * (1 - Math.exp(-Math.abs(dx) / limit));
}

/**
 * Moves slowly at first, then breaks through the resistance: speeds up
 * smoothly until it catches up with `dx`, and follows it from then on.
 */
function breakThrough(dx: number, width: number): number {
  const distance = Math.abs(dx) / width;
  const t = Math.min(Math.max((distance - BREAK_START) / BREAK_LENGTH, 0), 1);
  const eased = t * t * (3 - 2 * t);
  return dx * (RESISTANCE + (1 - RESISTANCE) * eased);
}

/** Whether a swipe by `dx` hasn't broken through the resistance yet. */
function resists(dx: number, width: number): boolean {
  return Math.abs(dx) < width * (BREAK_START + BREAK_LENGTH);
}

/**
 * Goes to the next or previous slide when the slides are swiped left or right
 * on a touch screen, keeping their steps like `nextSlide` and `previousSlide`.
 *
 * The slides follow the finger, and the next one slides in once the swipe
 * goes far or fast enough. Touches that move less than {@link TOUCH_SLOP} are
 * taps or long presses instead.
 *
 * If the current slide has more steps, it resists swiping forward: it moves
 * slowly at first, until the finger moves far enough to break through, when it
 * speeds up to catch up with the finger.
 * Meanwhile, a hint tells that tapping goes through the steps.
 *
 * Swipes starting on elements that take input themselves, like text fields and
 * sliders, are ignored (see {@link getInteraction}).
 */
export function useSwipeNavigation({
  hasMoreSteps,
  canGoNext,
  canGoPrevious,
  nextSlide,
  previousSlide,
  width,
  disabled = false,
}: SwipeNavigationOptions): SwipeNavigation {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const swipeRef = useRef<Swipe>(undefined);
  const suppressClickRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [transition, setTransition] =
    useState<SwipeNavigation['transition']>('none');
  const [enterFrom, setEnterFrom] = useState<number>();
  const [hintShown, setHintShown] = useState(false);
  const [hintLingers, setHintLingers] = useState(false);

  useEffect(() => {
    if (!hintLingers) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setHintLingers(false);
    }, HINT_DURATION);
    return () => {
      clearTimeout(timeout);
    };
  }, [hintLingers]);

  useEffect(() => {
    if (transition === 'none') {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setTransition('none');
    }, SETTLE_DURATION + END_GRACE);
    return () => {
      clearTimeout(timeout);
    };
  }, [transition]);

  useEffect(() => {
    if (enterFrom === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setEnterFrom(undefined);
    }, ENTER_DURATION + END_GRACE);
    return () => {
      clearTimeout(timeout);
    };
  }, [enterFrom]);

  /** Lets the slides move back from where they are shown to where they belong. */
  const settle = useCallback(() => {
    setDragging(false);
    setOffset(0);
    setTransition(offset === 0 || reducedMotion ? 'none' : 'settle');
  }, [offset, reducedMotion]);

  const displayOffset = useCallback(
    (dx: number, swipe: Swipe) => {
      if ((dx < 0 && !canGoNext) || (dx > 0 && !canGoPrevious)) {
        return rubberBand(dx, width * EDGE_LIMIT);
      }
      if (dx < 0 && swipe.resisted) {
        return breakThrough(dx, width);
      }
      return dx;
    },
    [canGoNext, canGoPrevious, width],
  );

  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const swipe = swipeRef.current;
    if (swipe?.pointerId !== event.pointerId) {
      return;
    }
    swipeRef.current = undefined;
    // If swiping got disabled, the slides are settling already.
    if (swipe.horizontal !== true || disabled) {
      return;
    }
    suppressClickRef.current = true;
    setHintShown(false);
    const dx = event.clientX - swipe.startX;
    const velocity = velocityOf(swipe.samples);
    const forward = dx < 0;
    const far = Math.abs(dx) > width * DISTANCE_THRESHOLD;
    const fast =
      Math.abs(dx) > FLING_DISTANCE &&
      Math.sign(velocity) === Math.sign(dx) &&
      Math.abs(velocity) > FLING_VELOCITY;
    const possible = forward ? canGoNext : canGoPrevious;
    const resisting = forward && swipe.resisted && resists(dx, width);
    if (cancelled || !possible || resisting || !(far || fast)) {
      settle();
      if (forward && swipe.resisted) {
        setHintLingers(true);
      }
      return;
    }
    setDragging(false);
    setHintLingers(false);
    setOffset(0);
    setTransition('none');
    // The slides keep moving from where they are, now around the new slide.
    if (!reducedMotion) {
      setEnterFrom(forward ? offset + width : offset - width);
    }
    if (forward) {
      nextSlide();
    } else {
      previousSlide();
    }
  };

  // Stop swiping when something else takes over the touch, like a menu opened
  // by a long press.
  if (disabled && dragging) {
    settle();
    setHintShown(false);
  }

  const handlers: SwipeHandlers = {
    onPointerDown: (event) => {
      suppressClickRef.current = false;
      setHintLingers(false);
      const interaction = getInteraction(event.target);
      if (
        disabled ||
        event.pointerType === 'mouse' ||
        !event.isPrimary ||
        (interaction !== undefined && interaction !== 'activatable')
      ) {
        return;
      }
      swipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        horizontal: undefined,
        resisted: hasMoreSteps(),
        samples: [],
      };
    },
    onPointerMove: (event) => {
      const swipe = swipeRef.current;
      if (disabled || swipe?.pointerId !== event.pointerId) {
        return;
      }
      if (swipe.horizontal === undefined) {
        const dx = event.clientX - swipe.startX;
        const dy = event.clientY - swipe.startY;
        if (Math.hypot(dx, dy) <= TOUCH_SLOP) {
          return;
        }
        swipe.horizontal = Math.abs(dx) > Math.abs(dy);
        if (!swipe.horizontal) {
          return;
        }
        // Start moving from here, so that the slides don't jump.
        swipe.startX = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        setEnterFrom(undefined);
        setTransition('none');
        setDragging(true);
      }
      if (!swipe.horizontal) {
        return;
      }
      const dx = event.clientX - swipe.startX;
      swipe.samples.push({ x: event.clientX, time: event.timeStamp });
      while (
        swipe.samples.length > 2 &&
        event.timeStamp - (swipe.samples[0]?.time ?? 0) > VELOCITY_WINDOW
      ) {
        swipe.samples.shift();
      }
      setOffset(displayOffset(dx, swipe));
      setHintShown(swipe.resisted && dx < 0 && canGoNext);
    },
    onPointerUp: (event) => {
      end(event, false);
    },
    onPointerCancel: (event) => {
      end(event, true);
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };

  const onTransitionEnd = useCallback(() => {
    setTransition('none');
  }, []);

  const onAnimationEnd = useCallback(() => {
    setEnterFrom(undefined);
  }, []);

  return {
    handlers,
    offset,
    transition,
    enterFrom,
    moving: dragging || transition !== 'none' || enterFrom !== undefined,
    onTransitionEnd,
    onAnimationEnd,
    showHint: hintShown || hintLingers,
  };
}
