import { useSyncExternalStore } from 'react';

/** Where the page may draw the title bar of its window. */
export interface TitleBar {
  /** Distance of the area from the left edge of the window. */
  readonly left: number;
  /** Distance of the area from the right edge of the window. */
  readonly right: number;
  readonly height: number;
  /** Width of the window, which the title bar spans. */
  readonly width: number;
}

/**
 * The Window Controls Overlay API, missing from the DOM types of TypeScript.
 * See https://developer.mozilla.org/docs/Web/API/Window_Controls_Overlay_API.
 */
interface WindowControlsOverlay extends EventTarget {
  readonly visible: boolean;
  getTitlebarAreaRect(): DOMRect;
}

function overlay(): WindowControlsOverlay | undefined {
  return (navigator as { windowControlsOverlay?: WindowControlsOverlay })
    .windowControlsOverlay;
}

function subscribe(listener: () => void): () => void {
  const current = overlay();
  current?.addEventListener('geometrychange', listener);
  window.addEventListener('resize', listener);
  return () => {
    current?.removeEventListener('geometrychange', listener);
    window.removeEventListener('resize', listener);
  };
}

let snapshot: TitleBar | undefined;

function getTitleBar(): TitleBar | undefined {
  const current = overlay();
  if (current?.visible !== true) {
    snapshot = undefined;
    return undefined;
  }
  const area = current.getTitlebarAreaRect();
  const titleBar = {
    left: area.left,
    right: window.innerWidth - area.right,
    height: area.height,
    width: window.innerWidth,
  };
  // The same object while the area is the same, as React expects.
  if (
    snapshot?.left !== titleBar.left ||
    snapshot.right !== titleBar.right ||
    snapshot.height !== titleBar.height ||
    snapshot.width !== titleBar.width
  ) {
    snapshot = titleBar;
  }
  return snapshot;
}

/**
 * Returns where the page draws the title bar of its window, if the window
 * leaves that to the page, e.g., an installed web app with
 * `window-controls-overlay` in its `display_override`, or the presenter
 * window of `seminar present`. The window controls of the browser cover a
 * part of it.
 */
export function useTitleBar(): TitleBar | undefined {
  return useSyncExternalStore(subscribe, getTitleBar, () => undefined);
}
