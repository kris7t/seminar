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

import { getInteraction, TOUCH_SLOP } from './interaction.ts';

/**
 * Fraction of the width of the slide a slow swipe has to cover to change the
 * slide.
 */
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
 * How long a slide that broke through the resistance of its steps takes to
 * catch up with the finger, in ms. It breaks through once the finger covers
 * {@link DISTANCE_THRESHOLD}, so a slide that gave way goes to the next one
 * when let go.
 */
const BREAK_DURATION = 150;

/**
 * Fraction of the width of the slide it moves at most at the first or last
 * slide.
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
  /** Distance between adjacent slides while swiping, in pixels. */
  spacing: number;
  /**
   * Width of the slide shown in the area, in pixels, which may be narrower
   * than the area if the slide doesn't fill it. Swipes have to cover distances
   * relative to it.
   */
  slideWidth: number;
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
   * How far the next slide lags behind the others, in pixels, while the
   * current slide resists being swiped past its steps.
   */
  nextLag: number;
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
  /**
   * When the swipe broke through the resistance of the steps, as returned by
   * `performance.now()`, or `undefined` if it hasn't.
   */
  brokeAt: number | undefined;
  /** How far the finger moved horizontally, in pixels. */
  dx: number;
  /** The device pixel ratio of the window of the slides. */
  pixelRatio: number;
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
 * How far a slide that broke through the resistance at `brokeAt` caught up
 * with the finger at `now`, from 0 to 1, eased out.
 */
function breakProgress(brokeAt: number | undefined, now: number): number {
  if (brokeAt === undefined) {
    return 0;
  }
  const t = Math.min(Math.max((now - brokeAt) / BREAK_DURATION, 0), 1);
  return 1 - (1 - t) ** 3;
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
 * slowly, until the finger moves far enough to break through, when it quickly
 * catches up with the finger. The next slide stays in place until then, so
 * that it doesn't seem to come yet.
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
  spacing,
  slideWidth,
  disabled = false,
}: SwipeNavigationOptions): SwipeNavigation {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const swipeRef = useRef<Swipe>(undefined);
  const suppressClickRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [nextLag, setNextLag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [transition, setTransition] =
    useState<SwipeNavigation['transition']>('none');
  const [enterFrom, setEnterFrom] = useState<number>();
  const [catchingUp, setCatchingUp] = useState(false);
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
    setCatchingUp(false);
    setOffset(0);
    setNextLag(0);
    setTransition(offset === 0 || reducedMotion ? 'none' : 'settle');
  }, [offset, reducedMotion]);

  /**
   * Moves the slides to where `swipe` puts them at `now`, and returns whether
   * they are still catching up with the finger.
   */
  const follow = useCallback(
    (swipe: Swipe, now: number): boolean => {
      const { dx, pixelRatio } = swipe;
      // On whole device pixels, so that the next slide doesn't show a sliver
      // of its edge while it stays in place.
      const round = (value: number) =>
        Math.round(value * pixelRatio) / pixelRatio;
      if ((dx < 0 && !canGoNext) || (dx > 0 && !canGoPrevious)) {
        const current = round(rubberBand(dx, slideWidth * EDGE_LIMIT));
        setOffset(current);
        setNextLag(0);
        return false;
      }
      if (dx >= 0 || !swipe.resisted) {
        setOffset(round(dx));
        setNextLag(0);
        return false;
      }
      if (
        swipe.brokeAt === undefined &&
        Math.abs(dx) > slideWidth * DISTANCE_THRESHOLD
      ) {
        swipe.brokeAt = now;
      }
      const progress = reducedMotion
        ? Number(swipe.brokeAt !== undefined)
        : breakProgress(swipe.brokeAt, now);
      const current = round(dx * (RESISTANCE + (1 - RESISTANCE) * progress));
      setOffset(current);
      setNextLag(round(dx * progress) - current);
      return swipe.brokeAt !== undefined && progress < 1;
    },
    [canGoNext, canGoPrevious, slideWidth, reducedMotion],
  );

  // The slide keeps catching up with the finger after it broke through, even
  // if the finger stops.
  useEffect(() => {
    if (!catchingUp) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick() {
      const swipe = swipeRef.current;
      if (swipe === undefined || !follow(swipe, performance.now())) {
        setCatchingUp(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [catchingUp, follow]);

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
    const far = Math.abs(dx) > slideWidth * DISTANCE_THRESHOLD;
    const fast =
      Math.abs(dx) > FLING_DISTANCE &&
      Math.sign(velocity) === Math.sign(dx) &&
      Math.abs(velocity) > FLING_VELOCITY;
    const possible = forward ? canGoNext : canGoPrevious;
    const resisting = forward && swipe.resisted && swipe.brokeAt === undefined;
    if (cancelled || !possible || resisting || !(far || fast)) {
      settle();
      if (forward && swipe.resisted) {
        setHintLingers(true);
      }
      return;
    }
    setDragging(false);
    setCatchingUp(false);
    setHintLingers(false);
    setOffset(0);
    setNextLag(0);
    setTransition('none');
    // The slides keep moving from where they are, now around the new slide.
    if (!reducedMotion) {
      setEnterFrom(forward ? offset + nextLag + spacing : offset - spacing);
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
        brokeAt: undefined,
        dx: 0,
        pixelRatio:
          event.currentTarget.ownerDocument.defaultView?.devicePixelRatio ?? 1,
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
      swipe.dx = event.clientX - swipe.startX;
      swipe.samples.push({ x: event.clientX, time: event.timeStamp });
      while (
        swipe.samples.length > 2 &&
        event.timeStamp - (swipe.samples[0]?.time ?? 0) > VELOCITY_WINDOW
      ) {
        swipe.samples.shift();
      }
      setCatchingUp(follow(swipe, performance.now()));
      setHintShown(swipe.resisted && swipe.dx < 0 && canGoNext);
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
    nextLag,
    transition,
    enterFrom,
    moving: dragging || transition !== 'none' || enterFrom !== undefined,
    onTransitionEnd,
    onAnimationEnd,
    showHint: hintShown || hintLingers,
  };
}
