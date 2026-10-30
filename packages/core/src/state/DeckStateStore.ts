import { KeyedListeners, Listeners } from './Listeners.ts';

/**
 * State of a deck that all of its slides share, by key, e.g., answers that
 * the audience gave on one slide and that later slides show.
 *
 * Values are `undefined` until they are set, and setting a value to
 * `undefined` removes it.
 */
export class DeckStateStore {
  readonly #values = new Map<string, unknown>();
  readonly #listeners = new KeyedListeners<string>();
  readonly #changeListeners = new Listeners();
  readonly #stateListeners = new Listeners<[keys: readonly string[]]>();

  /** Listens to changed keys, including resets, even when no view is mounted. */
  readonly subscribeState: (
    listener: (keys: readonly string[]) => void,
  ) => () => void = this.#stateListeners.subscribe;

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
    this.#stateListeners.notify([key]);
    this.#listeners.notify(key);
    if (wasChanged !== this.#values.size > 0) {
      this.#changeListeners.notify();
    }
  }

  subscribe(key: string, listener: () => void): () => void {
    return this.#listeners.subscribe(key, listener);
  }

  /** Whether any value is set. */
  getChanged = (): boolean => this.#values.size > 0;

  /** Listens to changes of {@link getChanged}. */
  readonly subscribeChanged: (listener: () => void) => () => void =
    this.#changeListeners.subscribe;

  /** Removes every value. */
  reset(): void {
    const keys = [...this.#values.keys()];
    if (keys.length === 0) {
      return;
    }
    this.#values.clear();
    this.#stateListeners.notify(keys);
    for (const key of keys) this.#listeners.notify(key);
    this.#changeListeners.notify();
  }
}
