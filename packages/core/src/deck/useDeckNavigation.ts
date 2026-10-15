import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { SlideStateStore } from '../state/SlideStateStore.ts';
import type { StepTarget } from '../steps/StepPosition.ts';
import { StepStore, type StepPath } from '../steps/StepStore.ts';
import {
  formatLocation,
  parseLocation,
  type DeckLocation,
} from './location.ts';
import {
  findFirstSlide,
  findLastSlide,
  findNextSlide,
  findPreviousSlide,
} from './spareSlides.ts';

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
  /** Whether no steps of the current slide are shown. */
  atFirstStep: boolean;
  /** Whether all steps of the current slide are shown. */
  atLastStep: boolean;
  /**
   * The slide that going forward shows, or `undefined` at the end. Skips spare
   * slides, unless the current slide is spare.
   */
  nextSlideIndex: number | undefined;
  /**
   * The slide that going back shows, or `undefined` at the beginning. Skips
   * spare slides, unless the current slide is spare.
   */
  previousSlideIndex: number | undefined;
  /** The first slide that isn't spare. */
  firstSlideIndex: number;
  /** The last slide that isn't spare. */
  lastSlideIndex: number;
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

/**
 * Returns the location of `step` on the slide, which refers to it by the name
 * of a step group if possible, so that links keep working when steps are added
 * before it.
 */
function locationOf(
  slideIndex: number,
  stepStore: StepStore,
  step: StepPath,
): DeckLocation {
  const { group, path } = stepStore.describePath(step);
  return { slideIndex, step: path, group };
}

/**
 * Returns the step to show for `location`, which is the first step in the
 * range of the slide if it doesn't refer to a step.
 */
function targetOf({ step, group }: DeckLocation): StepTarget {
  return {
    path: step,
    group,
    toEnd: false,
    inRange: step.length === 0 && group === undefined,
  };
}

function readLocation(
  slideIds: readonly (string | undefined)[],
  aliases: ReadonlyMap<string, number>,
) {
  return parseLocation(window.location.hash, slideIds, aliases);
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
 * Going forward and back skips spare slides, unless the current slide is
 * spare (see {@link findNextSlide}).
 *
 * Without a slide in the location hash, the deck starts at the first slide
 * that isn't spare.
 *
 * @param slideIds The ids of the slides, or `undefined` for slides without one.
 * @param aliases Further ids that refer to slides, e.g., of divisions of the
 *   deck without slides of their own, by the index of the slide.
 * @param spares Whether each slide is spare.
 */
export function useDeckNavigation(
  slideIds: readonly (string | undefined)[],
  aliases: ReadonlyMap<string, number>,
  spares: readonly boolean[],
  slideState: SlideStateStore,
): DeckNavigation {
  const slideCount = slideIds.length;
  const clamp = useCallback(
    (index: number) => Math.max(0, Math.min(index, slideCount - 1)),
    [slideCount],
  );

  const [initialIndex] = useState(() => {
    const location = readLocation(slideIds, aliases);
    const index = location?.slideIndex ?? findFirstSlide(spares);
    if (location !== undefined) {
      slideState.stepPosition(index).set(targetOf(location));
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
  // Steps may appear without the path changing, so these are followed on their
  // own.
  const atFirstStep = useSyncExternalStore(
    stepStore.subscribe,
    () => !stepStore.hasPrevious(),
  );
  const atLastStep = useSyncExternalStore(
    stepStore.subscribe,
    () => !stepStore.hasNext(),
  );

  const goTo = useCallback(
    (index: number, steps: GoToSteps = 'start') => {
      const newIndex = clamp(index);
      setRequestedIndex(newIndex);
      // The position of each slide is kept, so restoring needs nothing else.
      if (steps !== 'restore') {
        slideState
          .stepPosition(newIndex)
          .set({ path: [], toEnd: steps === 'end', inRange: true });
      }
    },
    [clamp, slideState],
  );
  const nextSlideIndex = findNextSlide(spares, slideIndex);
  const previousSlideIndex = findPreviousSlide(spares, slideIndex);
  const next = useCallback(() => {
    if (!stepStore.next() && nextSlideIndex !== undefined) {
      goTo(nextSlideIndex);
    }
  }, [stepStore, nextSlideIndex, goTo]);
  const previous = useCallback(() => {
    if (!stepStore.previous() && previousSlideIndex !== undefined) {
      goTo(previousSlideIndex, 'end');
    }
  }, [stepStore, previousSlideIndex, goTo]);
  const nextSlide = useCallback(() => {
    if (nextSlideIndex !== undefined) {
      goTo(nextSlideIndex, 'restore');
    }
  }, [goTo, nextSlideIndex]);
  const previousSlide = useCallback(() => {
    if (previousSlideIndex !== undefined) {
      goTo(previousSlideIndex, 'restore');
    }
  }, [goTo, previousSlideIndex]);
  const firstStep = useCallback(() => {
    stepStore.first();
  }, [stepStore]);
  const lastStep = useCallback(() => {
    stepStore.last();
  }, [stepStore]);

  // Fires when the user follows a link to a slide, edits the URL, or moves
  // through the browser history.
  const onHashChange = useEffectEvent(() => {
    const location = readLocation(slideIds, aliases);
    const newIndex =
      location === undefined ? slideIndex : clamp(location.slideIndex);
    if (location !== undefined) {
      setRequestedIndex(newIndex);
      slideState.stepPosition(newIndex).set(targetOf(location));
    }
    // If we stay on the same slide, the steps of the slide are already known,
    // so we can restore the canonical hash right away. Otherwise, the effect
    // below will update the hash once the new slide is rendered.
    if (newIndex === slideIndex) {
      const newHash = formatLocation(
        locationOf(slideIndex, stepStore, stepStore.getPath()),
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

  const hash = formatLocation(
    locationOf(slideIndex, stepStore, step),
    slideIds,
  );
  useEffect(() => {
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash);
    }
  }, [hash]);

  return {
    slideIndex,
    stepStore,
    atFirstStep,
    atLastStep,
    nextSlideIndex,
    previousSlideIndex,
    firstSlideIndex: findFirstSlide(spares),
    lastSlideIndex: findLastSlide(spares),
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
  };
}
