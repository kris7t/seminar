import { useCallback, useEffect, useState } from 'react';

import { getSeminarHost } from '../host/SeminarHost.ts';
import {
  enterFullscreen,
  getScreenDetails,
  isExtendedDesktop,
  screenAt,
  type ScreenChoice,
  type ScreenDetailed,
  type ScreenDetails,
} from './screens.ts';
import type { PresenterView } from './usePresenterView.ts';

export interface Presentation {
  /**
   * Starts the presentation, or stops it if the page is in full screen or the
   * presenter view is open already.
   */
  toggle: () => void;
  /**
   * The screens to choose from to show the presentation on, or `undefined` if
   * no choice has to be made.
   */
  screens: ScreenChoice | undefined;
  /**
   * Shows the presentation in full screen on a screen chosen from `screens`:
   * in this window if it's on that screen, or in the audience window of the
   * presenter view otherwise.
   */
  choose: (screen: ScreenDetailed) => void;
  /** Closes the choice of screens without starting the presentation. */
  cancel: () => void;
}

/**
 * How often to ask the host of the deck which screen this window is on while
 * the presenter chooses, in milliseconds.
 */
const HOST_POLL_INTERVAL = 500;

function warnFailure(error: unknown) {
  console.warn('Could not show the presentation in full screen:', error);
}

/**
 * Returns the screens to choose from, with the screen of this window from
 * the host of the deck, if it knows better than the browser.
 */
async function screenChoice(details: ScreenDetails): Promise<ScreenChoice> {
  const { screens, currentScreen } = details;
  const area = await getSeminarHost()?.currentScreen?.();
  return {
    screens,
    currentScreen:
      (area === undefined ? undefined : screenAt(screens, area)) ??
      currentScreen,
  };
}

/**
 * Starts the presentation by showing the page in full screen.
 *
 * If the device has more than one screen, and the browser can tell which
 * (only Chromium-based browsers can), it asks for the permission to see them,
 * and the presenter chooses which screen to show the presentation on. If it's
 * another screen, the slides are shown there by the audience window of the
 * presenter view, and this window stays as it is.
 *
 * Otherwise, the page is shown in full screen on the current screen.
 */
export function usePresentation(presenterView: PresenterView): Presentation {
  const [screens, setScreens] = useState<ScreenChoice>();
  // The screens while choosing, whose current screen Chromium keeps up to
  // date as this window moves.
  const [details, setDetails] = useState<ScreenDetails>();

  // The window may move to another screen while the presenter chooses.
  useEffect(() => {
    if (details === undefined) {
      return undefined;
    }
    const update = () => {
      screenChoice(details).then((choice) => {
        setScreens((previous) =>
          previous === undefined ||
          previous.currentScreen === choice.currentScreen
            ? previous
            : choice,
        );
      }, warnFailure);
    };
    details.addEventListener('currentscreenchange', update);
    // Which only the host knows on some platforms, like Wayland.
    const interval =
      getSeminarHost()?.currentScreen === undefined
        ? undefined
        : setInterval(update, HOST_POLL_INTERVAL);
    return () => {
      details.removeEventListener('currentscreenchange', update);
      clearInterval(interval);
    };
  }, [details]);

  const { audience, open, close } = presenterView;
  const toggle = useCallback(() => {
    if (audience !== undefined) {
      close();
      return;
    }
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
    getScreenDetails()
      .then(async (details) => {
        if (details === undefined || details.screens.length < 2) {
          // The permission prompt may have taken too long to still count as
          // a response to the user, in which case this fails.
          enterFullscreen().catch(warnFailure);
          return;
        }
        // Choosing in the dialog counts as a response of the user again.
        setScreens(await screenChoice(details));
        setDetails(details);
      })
      .catch(warnFailure);
  }, [audience, close]);

  const choose = useCallback(
    (screen: ScreenDetailed) => {
      setScreens(undefined);
      setDetails(undefined);
      const start = (current: ScreenDetailed | undefined) => {
        if (current !== undefined && screen !== current) {
          open(screen);
        } else {
          enterFullscreen().catch(warnFailure);
        }
      };
      // Where the window is now, which it may have left since the dialog
      // opened.
      if (
        details === undefined ||
        getSeminarHost()?.currentScreen === undefined
      ) {
        // Right away, in response to the user, as browsers require.
        start(details?.currentScreen ?? screens?.currentScreen);
      } else {
        screenChoice(details).then(({ currentScreen }) => {
          start(currentScreen);
        }, warnFailure);
      }
    },
    [details, screens, open],
  );

  const cancel = useCallback(() => {
    setScreens(undefined);
    setDetails(undefined);
  }, []);

  return { toggle, screens, choose, cancel };
}
