import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from 'react';

import { StepStore } from '../steps/StepStore.ts';
import { formatLocation, parseLocation } from './location.ts';

export interface DeckNavigation {
  /** Zero-based index of the current slide. */
  slideIndex: number;
  /** Keeps track of the steps of the current slide. */
  stepStore: StepStore;
  /** Goes to the beginning of a slide. */
  goTo: (slideIndex: number) => void;
  /** Goes to the next step, or to the next slide after the last step. */
  next: () => void;
  /**
   * Goes to the previous step, or to the last step of the previous slide
   * before the first step.
   */
  previous: () => void;
  /** Goes to the beginning of the next slide, skipping any steps. */
  nextSlide: () => void;
  /** Goes to the beginning of the previous slide, skipping any steps. */
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
 * @param slideIds The ids of the slides, or `undefined` for slides without one.
 */
export function useDeckNavigation(
  slideIds: readonly (string | undefined)[],
): DeckNavigation {
  const slideCount = slideIds.length;
  const clamp = useCallback(
    (index: number) => Math.max(0, Math.min(index, slideCount - 1)),
    [slideCount],
  );

  const [{ stepStore, initialIndex }] = useState(() => {
    const location = readLocation(slideIds);
    return {
      stepStore: new StepStore({ target: location?.step ?? [] }),
      initialIndex: location?.slideIndex ?? 0,
    };
  });
  const [requestedIndex, setRequestedIndex] = useState(initialIndex);
  const slideIndex = clamp(requestedIndex);
  const step = useSyncExternalStore(stepStore.subscribe, stepStore.getPath);

  const goToSlide = useCallback(
    (index: number, toEnd = false) => {
      setRequestedIndex(clamp(index));
      stepStore.reset([], toEnd);
    },
    [clamp, stepStore],
  );
  const goTo = useCallback(
    (index: number) => {
      goToSlide(index);
    },
    [goToSlide],
  );
  const next = useCallback(() => {
    if (!stepStore.next() && slideIndex < slideCount - 1) {
      goToSlide(slideIndex + 1);
    }
  }, [stepStore, slideIndex, slideCount, goToSlide]);
  const previous = useCallback(() => {
    if (!stepStore.previous() && slideIndex > 0) {
      goToSlide(slideIndex - 1, true);
    }
  }, [stepStore, slideIndex, goToSlide]);
  const nextSlide = useCallback(() => {
    if (slideIndex < slideCount - 1) {
      goToSlide(slideIndex + 1);
    }
  }, [slideIndex, slideCount, goToSlide]);
  const previousSlide = useCallback(() => {
    if (slideIndex > 0) {
      goToSlide(slideIndex - 1);
    }
  }, [slideIndex, goToSlide]);
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
      stepStore.reset(location.step);
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
