import {
  INITIAL_STEP_TARGET,
  type StepPosition,
  type StepTarget,
} from '../steps/StepPosition.ts';

/** Key of the position in the steps of a slide. */
const STEP_KEY = 'slider:steps';

/**
 * State of the slides of a deck that is shared by the views of the slides,
 * e.g., by the slide shown to the audience and its thumbnail in the overview,
 * and that outlives the views.
 *
 * Values are stored by the index of their slide and a key. They can be of any
 * type, including objects that only exist while the presentation runs, like
 * media streams.
 */
export class SlideStateStore {
  readonly #values = new Map<string, unknown>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #stepPositions = new Map<number, StepPosition>();

  #id(slideIndex: number, key: string): string {
    return `${String(slideIndex)}\u0000${key}`;
  }

  has(slideIndex: number, key: string): boolean {
    return this.#values.has(this.#id(slideIndex, key));
  }

  get(slideIndex: number, key: string): unknown {
    return this.#values.get(this.#id(slideIndex, key));
  }

  /**
   * Returns the value of `key`, storing `initial()` first if it has none.
   * Doesn't notify listeners, since nobody could have seen another value, so
   * that it may be called while rendering.
   */
  getOrInit(slideIndex: number, key: string, initial: () => unknown): unknown {
    const id = this.#id(slideIndex, key);
    if (!this.#values.has(id)) {
      this.#values.set(id, initial());
    }
    return this.#values.get(id);
  }

  set(slideIndex: number, key: string, value: unknown): void {
    const id = this.#id(slideIndex, key);
    if (this.#values.has(id) && Object.is(this.#values.get(id), value)) {
      return;
    }
    this.#values.set(id, value);
    for (const listener of this.#listeners.get(id) ?? []) {
      listener();
    }
  }

  subscribe(slideIndex: number, key: string, listener: () => void): () => void {
    const id = this.#id(slideIndex, key);
    let listeners = this.#listeners.get(id);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(id);
      }
    };
  }

  /**
   * Returns the position in the steps of a slide, which all of its views
   * share. The result is the same object for the same slide.
   */
  stepPosition(slideIndex: number): StepPosition {
    let position = this.#stepPositions.get(slideIndex);
    if (position === undefined) {
      position = {
        get: () =>
          (this.get(slideIndex, STEP_KEY) as StepTarget | undefined) ??
          INITIAL_STEP_TARGET,
        set: (target) => {
          this.set(slideIndex, STEP_KEY, target);
        },
        subscribe: (listener) => this.subscribe(slideIndex, STEP_KEY, listener),
      };
      this.#stepPositions.set(slideIndex, position);
    }
    return position;
  }
}
