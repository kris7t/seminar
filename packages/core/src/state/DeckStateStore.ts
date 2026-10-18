/**
 * State of a deck that all of its slides share, by key, e.g., answers that
 * the audience gave on one slide and that later slides show.
 *
 * Values are `undefined` until they are set, and setting a value to
 * `undefined` removes it.
 */
export class DeckStateStore {
  readonly #values = new Map<string, unknown>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #changeListeners = new Set<() => void>();

  get(key: string): unknown {
    return this.#values.get(key);
  }

  set(key: string, value: unknown): void {
    if (Object.is(this.#values.get(key), value)) {
      return;
    }
    const wasChanged = this.#values.size > 0;
    if (value === undefined) {
      this.#values.delete(key);
    } else {
      this.#values.set(key, value);
    }
    for (const listener of this.#listeners.get(key) ?? []) {
      listener();
    }
    if (wasChanged !== this.#values.size > 0) {
      this.#notifyChanged();
    }
  }

  subscribe(key: string, listener: () => void): () => void {
    let listeners = this.#listeners.get(key);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(key);
      }
    };
  }

  /** Whether any value is set. */
  getChanged = (): boolean => this.#values.size > 0;

  /** Listens to changes of {@link getChanged}. */
  subscribeChanged = (listener: () => void): (() => void) => {
    this.#changeListeners.add(listener);
    return () => {
      this.#changeListeners.delete(listener);
    };
  };

  /** Removes every value. */
  reset(): void {
    const keys = [...this.#values.keys()];
    if (keys.length === 0) {
      return;
    }
    this.#values.clear();
    for (const key of keys) {
      for (const listener of this.#listeners.get(key) ?? []) {
        listener();
      }
    }
    this.#notifyChanged();
  }

  #notifyChanged(): void {
    for (const listener of this.#changeListeners) {
      listener();
    }
  }
}
