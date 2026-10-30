/** Listeners that are notified with the same arguments. */
export class Listeners<Args extends readonly unknown[] = []> {
  readonly #listeners = new Set<(...args: Args) => void>();

  subscribe = (listener: (...args: Args) => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  notify(...args: Args): void {
    for (const listener of this.#listeners) listener(...args);
  }
}

/** Listeners of values by their key, kept only while someone listens. */
export class KeyedListeners<K> {
  readonly #listeners = new Map<K, Set<() => void>>();

  subscribe(key: K, listener: () => void): () => void {
    let listeners = this.#listeners.get(key);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(key);
    };
  }

  notify(key: K): void {
    for (const listener of this.#listeners.get(key) ?? []) listener();
  }
}
