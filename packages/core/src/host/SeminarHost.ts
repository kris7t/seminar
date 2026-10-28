import type { PrintOptions } from '../print/PrintView.tsx';

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
   * Called once the pages are ready to print, instead of opening the print
   * dialog of the browser.
   */
  readonly printReady?: (() => void) | undefined;
}

/** Returns the {@link SeminarHost} of the window, if any. */
export function getSeminarHost(): SeminarHost | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as { seminarHost?: SeminarHost }).seminarHost;
}
