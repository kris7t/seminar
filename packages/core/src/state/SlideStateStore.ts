import {
  INITIAL_STEP_TARGET,
  type StepPosition,
  type StepTarget,
} from '../steps/StepPosition.ts';

/** Key of the position in the steps of a slide. */
const STEP_KEY = 'seminar:steps';

interface StateValue {
  value: unknown;
  transient: boolean;
}

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
  readonly #values = new Map<string, StateValue>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #stepPositions = new Map<number, StepPosition>();
  readonly #changeListeners = new Set<() => void>();
  readonly #stateListeners = new Set<(indices: readonly number[]) => void>();
  #changed: ReadonlySet<number> = new Set();

  /** Listens to changed slides, excluding transient values, steps, and initialization. */
  subscribeState = (
    listener: (indices: readonly number[]) => void,
  ): (() => void) => {
    this.#stateListeners.add(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  };

  #notifyState(indices: readonly number[]): void {
    if (indices.length === 0) return;
    for (const listener of this.#stateListeners) listener(indices);
  }

  #id(slideIndex: number, key: string): string {
    return `${String(slideIndex)}\u0000${key}`;
  }

  has(slideIndex: number, key: string): boolean {
    return this.#values.has(this.#id(slideIndex, key));
  }

  get(slideIndex: number, key: string): unknown {
    return this.#values.get(this.#id(slideIndex, key))?.value;
  }

  /**
   * Returns the value of `key`, storing `initial()` first if it has none.
   * Doesn't notify listeners, since nobody could have seen another value, so
   * that it may be called while rendering.
   */
  getOrInit(
    slideIndex: number,
    key: string,
    initial: () => unknown,
    transient = false,
  ): unknown {
    const id = this.#id(slideIndex, key);
    let entry = this.#values.get(id);
    if (entry === undefined) {
      entry = { value: initial(), transient };
      this.#values.set(id, entry);
    }
    return entry.value;
  }

  set(slideIndex: number, key: string, value: unknown): void {
    const id = this.#id(slideIndex, key);
    const previous = this.#values.get(id);
    if (previous !== undefined && Object.is(previous.value, value)) {
      return;
    }
    this.#values.set(id, { value, transient: previous?.transient ?? false });
    if (key !== STEP_KEY && previous?.transient !== true)
      this.#notifyState([slideIndex]);
    if (
      key !== STEP_KEY &&
      previous?.transient !== true &&
      !this.#changed.has(slideIndex)
    ) {
      this.#setChanged(new Set([...this.#changed, slideIndex]));
    }
    this.#notify(id);
  }

  #notify(id: string): void {
    for (const listener of this.#listeners.get(id) ?? []) {
      listener();
    }
  }

  #setChanged(changed: ReadonlySet<number>): void {
    this.#changed = changed;
    for (const listener of this.#changeListeners) {
      listener();
    }
  }

  /**
   * Whether the slide has non-transient state other than its position in its
   * steps, e.g., from `useSlideState`.
   */
  hasState(slideIndex: number): boolean {
    return this.#keysOf(slideIndex).length > 0;
  }

  /**
   * The slides whose non-transient state other than their position in their
   * steps was set since they were reset, rather than only initialized. The
   * result is the same object until it changes.
   */
  getChanged = (): ReadonlySet<number> => this.#changed;

  /** Listens to changes of {@link getChanged}. */
  subscribeChanged = (listener: () => void): (() => void) => {
    this.#changeListeners.add(listener);
    return () => {
      this.#changeListeners.delete(listener);
    };
  };

  /**
   * Removes the non-transient state of the slide other than its position in
   * its steps, so that its views initialize it again.
   */
  reset(slideIndex: number): void {
    const ids = this.#keysOf(slideIndex);
    for (const id of ids) {
      this.#values.delete(id);
    }
    if (ids.length > 0) this.#notifyState([slideIndex]);
    if (this.#changed.has(slideIndex)) {
      this.#setChanged(
        new Set([...this.#changed].filter((index) => index !== slideIndex)),
      );
    }
    for (const id of ids) {
      this.#notify(id);
    }
  }

  /**
   * Removes every value, including transient state and saved step positions.
   * Each slide and recap starts at the beginning of its own step range.
   */
  resetAll(): void {
    const ids = [...this.#values.keys()];
    const slides = new Set(
      ids
        .filter(
          (id) =>
            !id.endsWith(`\u0000${STEP_KEY}`) &&
            this.#values.get(id)?.transient !== true,
        )
        .map((id) => Number(id.slice(0, id.indexOf('\u0000')))),
    );
    this.#values.clear();
    this.#notifyState([...slides]);
    if (this.#changed.size > 0) this.#setChanged(new Set());
    for (const id of ids) this.#notify(id);
  }

  /**
   * Moves the state of each slide to the index in `indices`, or removes it if
   * that is `undefined`, e.g., when slides were added or removed before it.
   */
  move(indices: readonly (number | undefined)[]): void {
    const ids = new Set<string>();
    const values = new Map<string, StateValue>();
    for (const [id, value] of this.#values) {
      ids.add(id);
      const separator = id.indexOf('\u0000');
      const index = indices[Number(id.slice(0, separator))];
      if (index !== undefined) {
        const newId = `${String(index)}${id.slice(separator)}`;
        ids.add(newId);
        values.set(newId, value);
      }
    }
    const changed = new Set<number>();
    for (const id of ids) {
      if (
        !id.endsWith(`\u0000${STEP_KEY}`) &&
        (this.#values.get(id)?.transient === false ||
          values.get(id)?.transient === false) &&
        (this.#values.has(id) !== values.has(id) ||
          !Object.is(this.#values.get(id)?.value, values.get(id)?.value))
      )
        changed.add(Number(id.slice(0, id.indexOf('\u0000'))));
    }
    this.#values.clear();
    for (const [id, value] of values) {
      this.#values.set(id, value);
    }
    this.#notifyState([...changed]);
    this.#setChanged(
      new Set(
        [...this.#changed].flatMap((slideIndex) => {
          const index = indices[slideIndex];
          return index === undefined ? [] : [index];
        }),
      ),
    );
    for (const id of ids) {
      this.#notify(id);
    }
  }

  #keysOf(slideIndex: number): string[] {
    const prefix = this.#id(slideIndex, '');
    const steps = this.#id(slideIndex, STEP_KEY);
    return [...this.#values.keys()].filter(
      (id) =>
        id.startsWith(prefix) &&
        id !== steps &&
        this.#values.get(id)?.transient !== true,
    );
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
