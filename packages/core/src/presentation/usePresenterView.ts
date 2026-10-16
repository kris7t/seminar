import createCache, { type EmotionCache } from '@emotion/cache';
import { useCallback, useEffect, useState } from 'react';

import { mirrorStylisPlugin } from './mirror/mirrorStylisPlugin.ts';
import type { ScreenDetailed } from './screens.ts';

/** Name of the audience window, so that a reloaded deck reuses it. */
const WINDOW_NAME = 'slider-audience';

/** Size of the audience window if no screen is given. */
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 540;

/** How often to check whether the audience window was closed, in ms. */
const POLL_INTERVAL = 500;

export interface AudienceWindow {
  window: Window;
  /** The screen to show the audience window on in full screen, if any. */
  screen: ScreenDetailed | undefined;
  /** The element of the window to render the slides into. */
  container: HTMLElement;
  /** Puts the styles of the rendered slides into the window. */
  cache: EmotionCache;
  /** When the window was opened, in milliseconds since the epoch. */
  openedAt: number;
}

/**
 * Prepares the document of the audience window, which may still have the
 * contents of a previous deck, if it was reloaded.
 */
function setUpDocument(
  target: Window,
): Pick<AudienceWindow, 'container' | 'cache'> {
  const { document: doc } = target;
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  // After clearing the head, which would remove the title element.
  doc.title = document.title;
  // Copy the styles that don't come from Emotion, like fonts. Emotion styles
  // of this window may be in the CSSOM only, so they are rendered again.
  for (const style of document.head.querySelectorAll(
    'style:not([data-emotion]), link[rel="stylesheet"]',
  )) {
    doc.head.append(doc.importNode(style, true));
  }
  const container = doc.createElement('div');
  doc.body.append(container);
  const cache = createCache({
    key: 'slider-audience',
    container: doc.head,
    // Show hover and focus of the presenter to the audience.
    stylisPlugins: [mirrorStylisPlugin],
  });
  return { container, cache };
}

export interface PresenterView {
  /** The window showing the slides to the audience, if it's open. */
  audience: AudienceWindow | undefined;
  /**
   * Opens the audience window, in full screen on `screen` if given, while
   * this window becomes the presenter view.
   *
   * Has to be called in response to the user, like a click, or browsers block
   * the window.
   *
   * @returns Whether the window could be opened.
   */
  open: (screen?: ScreenDetailed) => boolean;
  /** Closes the audience window. */
  close: () => void;
  /** Opens or closes the audience window. */
  toggle: () => void;
}

function windowFeatures(screen: ScreenDetailed | undefined): string {
  if (screen === undefined) {
    return `popup,width=${String(DEFAULT_WIDTH)},height=${String(DEFAULT_HEIGHT)}`;
  }
  const { availLeft, availTop, availWidth, availHeight } = screen;
  // Browsers that support it open the window in full screen right away.
  // Placing a window on another screen needs the permission to see them.
  return [
    'popup',
    'fullscreen',
    `left=${String(availLeft)}`,
    `top=${String(availTop)}`,
    `width=${String(availWidth)}`,
    `height=${String(availHeight)}`,
  ].join(',');
}

/**
 * Opens a separate window that shows the slides to the audience, while this
 * window becomes the presenter view.
 *
 * The presenter view ends when the audience window is closed, either by
 * {@link PresenterView.close} or by the user, or when this window is closed.
 */
export function usePresenterView(
  /** The name of the presenter view, added to the title of its window. */
  label = 'Presenter view',
): PresenterView {
  const [audience, setAudience] = useState<AudienceWindow>();

  const open = useCallback((screen?: ScreenDetailed) => {
    // Some environments return `undefined` instead of `null`.
    const opened =
      window.open('', WINDOW_NAME, windowFeatures(screen)) ?? undefined;
    if (opened === undefined) {
      console.warn('The audience window was blocked by the browser.');
      return false;
    }
    setAudience({
      window: opened,
      screen,
      ...setUpDocument(opened),
      openedAt: Date.now(),
    });
    return true;
  }, []);

  const close = useCallback(() => {
    audience?.window.close();
    setAudience(undefined);
  }, [audience]);

  const toggle = useCallback(() => {
    if (audience === undefined) {
      open();
    } else {
      close();
    }
  }, [audience, open, close]);

  // Tell the windows apart, e.g., when sharing one of them in a video call.
  useEffect(() => {
    if (audience === undefined) {
      return undefined;
    }
    const title = document.title;
    document.title = `${title} (${label})`;
    return () => {
      document.title = title;
    };
  }, [audience, label]);

  useEffect(() => {
    if (audience === undefined) {
      return undefined;
    }
    const target = audience.window;
    const onClosed = () => {
      setAudience(undefined);
    };
    // Close the audience window along with the deck.
    const onUnload = () => {
      target.close();
    };
    target.addEventListener('pagehide', onClosed);
    window.addEventListener('pagehide', onUnload);
    // Not every browser fires the event when the user closes a window.
    const interval = setInterval(() => {
      if (target.closed) {
        onClosed();
      }
    }, POLL_INTERVAL);
    return () => {
      target.removeEventListener('pagehide', onClosed);
      window.removeEventListener('pagehide', onUnload);
      clearInterval(interval);
    };
  }, [audience]);

  return { audience, open, close, toggle };
}
