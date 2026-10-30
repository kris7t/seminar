import { KeyedListeners } from '../state/Listeners.ts';
import {
  INITIAL_STEP_TARGET,
  type StepPosition,
  type StepTarget,
} from './StepPosition.ts';

/**
 * The positions in the steps of the slides of a deck, which the views of each
 * slide share, e.g., the slide shown to the audience and its thumbnail, and
 * which outlive the views.
 */
export class StepPositionStore {
  readonly #targets = new Map<number, StepTarget>();
  readonly #positions = new Map<number, StepPosition>();
  readonly #listeners = new KeyedListeners<number>();

  /**
   * Returns the position in the steps of a slide. The result is the same
   * object for the same slide.
   */
  stepPosition(slideIndex: number): StepPosition {
    let position = this.#positions.get(slideIndex);
    if (position === undefined) {
      position = {
        get: () => this.#targets.get(slideIndex) ?? INITIAL_STEP_TARGET,
        set: (target) => {
          if (this.#targets.get(slideIndex) === target) return;
          this.#targets.set(slideIndex, target);
          this.#listeners.notify(slideIndex);
        },
        subscribe: (listener) =>
          this.#listeners.subscribe(slideIndex, listener),
      };
      this.#positions.set(slideIndex, position);
    }
    return position;
  }

  /**
   * Moves the position of each slide to the index in `indices`, or removes it
   * if that is `undefined`, e.g., when slides were added or removed before it.
   */
  move(indices: readonly (number | undefined)[]): void {
    const affected = new Set(this.#targets.keys());
    const targets = [...this.#targets].flatMap(([slideIndex, target]) => {
      const index = indices[slideIndex];
      return index === undefined ? [] : [[index, target] as const];
    });
    this.#targets.clear();
    for (const [index, target] of targets) {
      affected.add(index);
      this.#targets.set(index, target);
    }
    for (const index of affected) this.#listeners.notify(index);
  }

  /** Puts each slide at the beginning of its own step range. */
  resetAll(): void {
    const indices = [...this.#targets.keys()];
    this.#targets.clear();
    for (const index of indices) this.#listeners.notify(index);
  }
}
