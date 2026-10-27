import { SlideTransitions } from '../transitions/SlideTransitions.ts';

/**
 * The transitions of pages being printed, which never change, but which keep
 * track of the components that hold them, e.g., while they load, so that
 * printing can wait until the pages are ready.
 */
export class PrintTransitions extends SlideTransitions {
  readonly #holds = new Set<object>();

  override hold(): () => void {
    const entry = {};
    this.#holds.add(entry);
    return () => {
      this.#holds.delete(entry);
    };
  }

  /** Whether a component holds the pages, i.e., isn't ready yet. */
  isHeld(): boolean {
    return this.#holds.size > 0;
  }
}
