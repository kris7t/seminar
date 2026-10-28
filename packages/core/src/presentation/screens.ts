/*
 * The Window Management API, which only Chromium implements, so it's missing
 * from the DOM types of TypeScript.
 * See https://w3c.github.io/window-management/.
 */

import type { ScreenArea } from '../host/SeminarHost.ts';

/** A screen connected to the device. */
export interface ScreenDetailed extends Screen {
  readonly left: number;
  readonly top: number;
  /** Position of the area of the screen available to windows. */
  readonly availLeft: number;
  readonly availTop: number;
  readonly isPrimary: boolean;
  readonly isInternal: boolean;
  readonly devicePixelRatio: number;
  /** A name of the screen, like the model of the monitor, or empty. */
  readonly label: string;
}

/** Screens to choose from, and the screen that this window is on. */
export interface ScreenChoice {
  readonly screens: readonly ScreenDetailed[];
  readonly currentScreen: ScreenDetailed;
}

/** The screens connected to the device. */
export interface ScreenDetails extends EventTarget, ScreenChoice {}

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

/** Returns the area of `screen` available to windows. */
export function availableArea(screen: ScreenDetailed): ScreenArea {
  const { availLeft, availTop, availWidth, availHeight } = screen;
  return {
    left: availLeft,
    top: availTop,
    width: availWidth,
    height: availHeight,
  };
}

/** Returns the screen of `screens` that the middle of `area` is on, if any. */
export function screenAt(
  screens: readonly ScreenDetailed[],
  { left, top, width, height }: ScreenArea,
): ScreenDetailed | undefined {
  const x = left + width / 2;
  const y = top + height / 2;
  return screens.find(
    (screen) =>
      x >= screen.left &&
      x < screen.left + screen.width &&
      y >= screen.top &&
      y < screen.top + screen.height,
  );
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
 * Shows the whole page of `doc` in full screen, on `screen` if given, which
 * moves its window there.
 */
export async function enterFullscreen(
  screen?: ScreenDetailed,
  doc: Document = document,
): Promise<void> {
  const options: FullscreenOnScreenOptions = {
    navigationUI: 'hide',
    ...(screen === undefined ? {} : { screen }),
  };
  await doc.documentElement.requestFullscreen(options);
}
