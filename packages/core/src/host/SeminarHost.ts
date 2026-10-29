import type { PrintedDocument, PrintOptions } from '../print/PrintView.tsx';

/** An area of the screens, in the coordinates of the Window Management API. */
export interface ScreenArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What an application that shows a deck, e.g., the Electron app of the
 * Seminar command line, asks of the deck. The application sets it as the
 * `seminarHost` property of the window, e.g., in a preload script, before
 * the deck is rendered.
 */
export interface SeminarHost {
  /** Options to print the deck with as soon as it is shown, if any. */
  readonly print?: PrintOptions | undefined;
  /**
   * Called once the pages are ready to print, with what they are, instead of
   * opening the print dialog of the browser.
   */
  readonly printReady?: ((printed: PrintedDocument) => void) | undefined;
  /**
   * Whether to start the presentation as soon as the deck is shown, as if
   * the presenter pressed P.
   */
  readonly present?: boolean | undefined;
  /**
   * Whether the deck is a preview, e.g., served by the dev server of Vite,
   * which the title of its window says.
   */
  readonly preview?: boolean | undefined;
  /**
   * Returns the area of the screen that the window of the deck is on, if the
   * application knows it better than the browser, e.g., on Wayland, where
   * pages can't tell where their windows are.
   */
  readonly currentScreen?: (() => Promise<ScreenArea | undefined>) | undefined;
  /**
   * Whether the application shows the audience window in full screen on the
   * screen with the area itself, instead of the deck asking the browser for
   * full screen, e.g., on Wayland, where the browser can't choose the screen.
   * The application closes the window once it leaves full screen.
   */
  readonly showsAudienceFullscreen?:
    ((screen: ScreenArea) => boolean) | undefined;
  /**
   * Moves the audience window to the screen with the area, before the deck
   * asks the browser for full screen there, if the browser can't choose the
   * screen itself, e.g., on Wayland. Resolves once the window is there, or
   * the application gave up.
   */
  readonly placeAudience?: ((screen: ScreenArea) => Promise<void>) | undefined;
}

/** Returns the {@link SeminarHost} of the window, if any. */
export function getSeminarHost(): SeminarHost | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as { seminarHost?: SeminarHost }).seminarHost;
}
