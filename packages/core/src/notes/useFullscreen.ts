import { useSyncExternalStore } from 'react';

/** Matches if the browser shows the page in full screen, e.g., with F11. */
const FULLSCREEN_QUERY = '(display-mode: fullscreen)';

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(FULLSCREEN_QUERY);
  document.addEventListener('fullscreenchange', listener);
  query.addEventListener('change', listener);
  return () => {
    document.removeEventListener('fullscreenchange', listener);
    query.removeEventListener('change', listener);
  };
}

function isFullscreen(): boolean {
  return (
    // Missing in environments without the Fullscreen API.
    (document.fullscreenElement ?? null) !== null ||
    window.matchMedia(FULLSCREEN_QUERY).matches
  );
}

/**
 * Whether the page is shown in full screen, either with the Fullscreen API or
 * by the browser, e.g., after pressing F11.
 */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, isFullscreen);
}
