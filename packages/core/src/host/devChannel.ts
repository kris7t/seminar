/**
 * The channel between a page of a deck and an editor, through a dev server
 * that supports it, e.g., that of `seminar dev`. Messages only reach the other
 * pages showing the same deck and the editor.
 */
export interface DevChannel {
  /** Sends `data`, which has to be JSON, with the name `event`. */
  send: (event: string, data: unknown) => void;
  /** Calls `listener` with the data of `event`, until the returned call. */
  on: (event: string, listener: (data: unknown) => void) => () => void;
}

const CHANNEL = Symbol.for('seminar.devChannel');

/**
 * Returns the channel to the editor, if the dev server of the page provides
 * one.
 */
export function getDevChannel(): DevChannel | undefined {
  return (globalThis as { [CHANNEL]?: DevChannel })[CHANNEL];
}
