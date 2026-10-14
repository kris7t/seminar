import { useEffect, useEffectEvent, useState } from 'react';

const SLIDE_NUMBER_PATTERN = /^slide=(\d+)$/;

function decodeFragment(hash: string): string {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function parseHash(
  hash: string,
  slideIds: readonly (string | undefined)[],
): number | undefined {
  const fragment = decodeFragment(hash);
  const match = SLIDE_NUMBER_PATTERN.exec(fragment);
  if (match?.[1] !== undefined) {
    return Math.max(Number.parseInt(match[1], 10) - 1, 0);
  }
  const index = slideIds.indexOf(fragment);
  return index >= 0 ? index : undefined;
}

function formatHash(
  slideIndex: number,
  slideIds: readonly (string | undefined)[],
): string {
  const id = slideIds[slideIndex];
  return id === undefined
    ? `#slide=${String(slideIndex + 1)}`
    : `#${encodeURIComponent(id)}`;
}

/**
 * Keeps the current slide index in sync with the location hash, so that
 * reloading the page keeps the current slide.
 *
 * The hash of a slide is its id if it has one, and `slide=<n>` (with a 1-based
 * slide number) otherwise. Navigating to `slide=<n>` also works for slides
 * with an id.
 *
 * @param slideIds The ids of the slides, or `undefined` for slides without one.
 * @param clamp Clamps a slide index to the valid range.
 */
export function useSlideIndex(
  slideIds: readonly (string | undefined)[],
  clamp: (slideIndex: number) => number,
): [
  slideIndex: number,
  setSlideIndex: (update: (slideIndex: number) => number) => void,
] {
  const [requestedIndex, setRequestedIndex] = useState(
    () => parseHash(window.location.hash, slideIds) ?? 0,
  );
  const slideIndex = clamp(requestedIndex);

  // Fires when the user follows a link to a slide, edits the URL, or moves
  // through the browser history.
  const onHashChange = useEffectEvent(() => {
    const newIndex = clamp(
      parseHash(window.location.hash, slideIds) ?? slideIndex,
    );
    setRequestedIndex(newIndex);
    // If the slide doesn't change (e.g., following `#slide=<n>` to the current
    // slide or an unknown id), the effect below won't run, so we restore the
    // canonical hash here.
    const newHash = formatHash(newIndex, slideIds);
    if (window.location.hash !== newHash) {
      window.history.replaceState(window.history.state, '', newHash);
    }
  });

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const hash = formatHash(slideIndex, slideIds);
  useEffect(() => {
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash);
    }
  }, [hash]);

  return [slideIndex, setRequestedIndex];
}
