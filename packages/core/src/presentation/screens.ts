/*
 * The Window Management API, which only Chromium implements, so it's missing
 * from the DOM types of TypeScript.
 * See https://w3c.github.io/window-management/.
 */

/** A screen connected to the device. */
export interface ScreenDetailed extends Screen {
  readonly left: number;
  readonly top: number;
  readonly isPrimary: boolean;
  readonly isInternal: boolean;
  readonly devicePixelRatio: number;
  /** A name of the screen, like the model of the monitor, or empty. */
  readonly label: string;
}

/** The screens connected to the device. */
export interface ScreenDetails extends EventTarget {
  readonly screens: readonly ScreenDetailed[];
  readonly currentScreen: ScreenDetailed;
}

interface ExtendedScreen extends Screen {
  readonly isExtended?: boolean;
}

interface WindowWithScreenDetails {
  getScreenDetails?: () => Promise<ScreenDetails>;
}

/** Options of `requestFullscreen` with the screen to show the element on. */
export interface FullscreenOnScreenOptions extends FullscreenOptions {
  screen?: ScreenDetailed;
}

/**
 * Whether the device has more than one screen. `false` in browsers that can't
 * tell, which can't put the presentation on a chosen screen anyway.
 */
export function isExtendedDesktop(): boolean {
  return (window.screen as ExtendedScreen).isExtended === true;
}

/**
 * Returns the screens of the device, asking for the permission of the user
 * first if needed, or `undefined` if the browser can't tell or the user
 * didn't allow it.
 */
export async function getScreenDetails(): Promise<ScreenDetails | undefined> {
  const { getScreenDetails: get } = window as WindowWithScreenDetails;
  if (get === undefined) {
    return undefined;
  }
  try {
    return await get.call(window);
  } catch {
    // The user denied the permission.
    return undefined;
  }
}

/**
 * Shows the whole page in full screen, on `screen` if given, which moves the
 * window there.
 */
export async function enterFullscreen(screen?: ScreenDetailed): Promise<void> {
  const options: FullscreenOnScreenOptions = {
    navigationUI: 'hide',
    ...(screen === undefined ? {} : { screen }),
  };
  await document.documentElement.requestFullscreen(options);
}
