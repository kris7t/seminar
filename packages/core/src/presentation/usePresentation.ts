import { useCallback, useState } from 'react';

import {
  enterFullscreen,
  getScreenDetails,
  isExtendedDesktop,
  type ScreenDetailed,
  type ScreenDetails,
} from './screens.ts';

export interface Presentation {
  /**
   * Starts the presentation, or stops it if the page is in full screen
   * already.
   */
  toggle: () => void;
  /**
   * The screens to choose from to show the presentation on, or `undefined` if
   * no choice has to be made.
   */
  screens: ScreenDetails | undefined;
  /** Shows the presentation in full screen on a screen chosen from `screens`. */
  choose: (screen: ScreenDetailed) => void;
  /** Closes the choice of screens without starting the presentation. */
  cancel: () => void;
}

function warnFailure(error: unknown) {
  console.warn('Could not show the presentation in full screen:', error);
}

/**
 * Starts the presentation by showing the page in full screen.
 *
 * If the device has more than one screen, and the browser can tell which
 * (only Chromium-based browsers can), it asks for the permission to see them,
 * and the presenter chooses which screen to show the presentation on.
 * Otherwise, the page is shown in full screen on the current screen.
 */
export function usePresentation(): Presentation {
  const [screens, setScreens] = useState<ScreenDetails>();

  const toggle = useCallback(() => {
    // Missing in environments without the Fullscreen API.
    if ((document.fullscreenElement ?? null) !== null) {
      document.exitFullscreen().catch(warnFailure);
      return;
    }
    if (!isExtendedDesktop()) {
      // Has to be called right away while handling the click or key press,
      // since browsers only allow it in response to the user.
      enterFullscreen().catch(warnFailure);
      return;
    }
    getScreenDetails().then((details) => {
      if (details === undefined || details.screens.length < 2) {
        // The permission prompt may have taken too long to still count as
        // a response to the user, in which case this fails.
        enterFullscreen().catch(warnFailure);
        return;
      }
      // Choosing in the dialog counts as a response of the user again.
      setScreens(details);
    }, warnFailure);
  }, []);

  const choose = useCallback((screen: ScreenDetailed) => {
    setScreens(undefined);
    enterFullscreen(screen).catch(warnFailure);
  }, []);

  const cancel = useCallback(() => {
    setScreens(undefined);
  }, []);

  return { toggle, screens, choose, cancel };
}
