import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { SlideStateStore } from '../state/SlideStateStore.ts';
import { StepStore } from '../steps/StepStore.ts';
import { formatLocation, parseLocation } from './location.ts';

/** Which steps of a slide to show when going to it. See `goTo`. */
export type GoToSteps = 'start' | 'end' | 'restore';

export interface DeckNavigation {
  /** Zero-based index of the current slide. */
  slideIndex: number;
  /**
   * Keeps track of the steps of the current slide in the audience view, which
   * navigation goes through.
   */
  stepStore: StepStore;
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
}

function readLocation(slideIds: readonly (string | undefined)[]) {
  return parseLocation(window.location.hash, slideIds);
}

/**
 * Keeps track of the current slide and step, and keeps them in sync with the
 * location hash, so that reloading the page keeps the current position.
 *
 * See {@link parseLocation} for the format of the location hash.
 *
 * The position in the steps of each slide is kept in `slideState`, so that
 * other views of the slide show the same step.
 *
 * @param slideIds The ids of the slides, or `undefined` for slides without one.
 */
export function useDeckNavigation(
  slideIds: readonly (string | undefined)[],
  slideState: SlideStateStore,
): DeckNavigation {
  const slideCount = slideIds.length;
  const clamp = useCallback(
    (index: number) => Math.max(0, Math.min(index, slideCount - 1)),
    [slideCount],
  );

  const [initialIndex] = useState(() => {
    const location = readLocation(slideIds);
    const index = location?.slideIndex ?? 0;
    if (location !== undefined) {
      slideState.stepPosition(index).set({ path: location.step, toEnd: false });
    }
    return index;
  });
  const [requestedIndex, setRequestedIndex] = useState(initialIndex);
  const slideIndex = clamp(requestedIndex);
  const stepStore = useMemo(
    () => new StepStore({ position: slideState.stepPosition(slideIndex) }),
    [slideState, slideIndex],
  );
  const step = useSyncExternalStore(stepStore.subscribe, stepStore.getPath);

  const goTo = useCallback(
    (index: number, steps: GoToSteps = 'start') => {
      const newIndex = clamp(index);
      setRequestedIndex(newIndex);
      // The position of each slide is kept, so restoring needs nothing else.
      if (steps !== 'restore') {
        slideState
          .stepPosition(newIndex)
          .set({ path: [], toEnd: steps === 'end' });
      }
    },
    [clamp, slideState],
  );
  const next = useCallback(() => {
    if (!stepStore.next() && slideIndex < slideCount - 1) {
      goTo(slideIndex + 1);
    }
  }, [stepStore, slideIndex, slideCount, goTo]);
  const previous = useCallback(() => {
    if (!stepStore.previous() && slideIndex > 0) {
      goTo(slideIndex - 1, 'end');
    }
  }, [stepStore, slideIndex, goTo]);
  const nextSlide = useCallback(() => {
    goTo(slideIndex + 1, 'restore');
  }, [goTo, slideIndex]);
  const previousSlide = useCallback(() => {
    goTo(slideIndex - 1, 'restore');
  }, [goTo, slideIndex]);
  const firstStep = useCallback(() => {
    stepStore.reset();
  }, [stepStore]);
  const lastStep = useCallback(() => {
    // The path of the last step depends on the steps that get rendered, so we
    // let the store resolve it.
    stepStore.reset([], true);
  }, [stepStore]);

  // Fires when the user follows a link to a slide, edits the URL, or moves
  // through the browser history.
  const onHashChange = useEffectEvent(() => {
    const location = readLocation(slideIds);
    const newIndex =
      location === undefined ? slideIndex : clamp(location.slideIndex);
    if (location !== undefined) {
      setRequestedIndex(newIndex);
      slideState
        .stepPosition(newIndex)
        .set({ path: location.step, toEnd: false });
    }
    // If we stay on the same slide, the steps of the slide are already known,
    // so we can restore the canonical hash right away. Otherwise, the effect
    // below will update the hash once the new slide is rendered.
    if (newIndex === slideIndex) {
      const newHash = formatLocation(
        { slideIndex, step: stepStore.getPath() },
        slideIds,
      );
      if (window.location.hash !== newHash) {
        window.history.replaceState(window.history.state, '', newHash);
      }
    }
  });

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const hash = formatLocation({ slideIndex, step }, slideIds);
  useEffect(() => {
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash);
    }
  }, [hash]);

  return {
    slideIndex,
    stepStore,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
  };
}
