import { KeyedListeners, Listeners } from './Listeners.ts';

/** Who a value belongs to: the deck, or a slide by its index. */
export type StateOwner = 'deck' | number;

/** A value that was set, reset, or moved. */
export interface StateChange {
  owner: StateOwner;
  family: object;
  key: string;
}

type Values = Map<object, Map<string, unknown>>;

/**
 * State of a deck and its slides, shared by the views of the slides, e.g., by
 * the slide shown to the audience and its thumbnail in the overview, and
 * outliving the views.
 *
 * Values belong to an owner, and are stored by their family, which tells
 * apart the values of different APIs, e.g., `useSlideState` and
 * `useDeckState`, and by a key within the family. They can be of any type,
 * including objects that only exist while the presentation runs, like media
 * streams. A value that was never set reads as `undefined`.
 */
export class StateStore {
  readonly #values = new Map<StateOwner, Values>();
  readonly #listeners = new Map<object, KeyedListeners<string>>();
  readonly #changeListeners = new Listeners<
    [changes: readonly StateChange[]]
  >();
  readonly #changedListeners = new Listeners();
  readonly #resets = new Map<StateOwner, number>();
  readonly #resetListeners = new Listeners();
  #allResets = 0;
  #changed: ReadonlySet<StateOwner> = new Set();

  /** Listens to values that were set, reset, or moved, but not initialized. */
  readonly subscribeChanges: (
    listener: (changes: readonly StateChange[]) => void,
  ) => () => void = this.#changeListeners.subscribe;

  has(owner: StateOwner, family: object, key: string): boolean {
    return this.#values.get(owner)?.get(family)?.has(key) ?? false;
  }

  get(owner: StateOwner, family: object, key: string): unknown {
    return this.#values.get(owner)?.get(family)?.get(key);
  }

  /**
   * Returns the value of `key`, storing `initial()` first if it has none.
   * Doesn't notify listeners, since nobody could have seen another value, so
   * that it may be called while rendering.
   */
  getOrInit(
    owner: StateOwner,
    family: object,
    key: string,
    initial: () => unknown,
  ): unknown {
    const values = this.#family(owner, family);
    if (values.has(key)) return values.get(key);
    const value = initial();
    values.set(key, value);
    return value;
  }

  set(owner: StateOwner, family: object, key: string, value: unknown): void {
    if (Object.is(this.get(owner, family, key), value)) return;
    this.#family(owner, family).set(key, value);
    this.#changeListeners.notify([{ owner, family, key }]);
    if (!this.#changed.has(owner))
      this.#setChanged(new Set([...this.#changed, owner]));
    this.#notify(owner, family, key);
  }

  subscribe(
    owner: StateOwner,
    family: object,
    key: string,
    listener: () => void,
  ): () => void {
    let listeners = this.#listeners.get(family);
    if (listeners === undefined) {
      listeners = new KeyedListeners();
      this.#listeners.set(family, listeners);
    }
    return listeners.subscribe(listenerKey(owner, key), listener);
  }

  /** Whether the owner has any value, even if it was only initialized. */
  hasState(owner: StateOwner): boolean {
    return this.#values.has(owner);
  }

  /**
   * The owners whose values were set since they were reset, rather than only
   * initialized. The result is the same object until it changes.
   */
  getChanged = (): ReadonlySet<StateOwner> => this.#changed;

  /** Listens to changes of {@link getChanged}. */
  readonly subscribeChanged: (listener: () => void) => () => void =
    this.#changedListeners.subscribe;

  /** Counts the resets of the owner, even if it had no values. */
  getResets(owner: StateOwner): number {
    return this.#allResets + (this.#resets.get(owner) ?? 0);
  }

  /** Listens to changes of {@link getResets}. */
  readonly subscribeResets: (listener: () => void) => () => void =
    this.#resetListeners.subscribe;

  /** Removes the values of the owner, so that its views initialize them again. */
  reset(owner: StateOwner): void {
    const changes = changesOf(owner, this.#values.get(owner));
    this.#values.delete(owner);
    this.#notifyChanges(changes);
    if (this.#changed.has(owner))
      this.#setChanged(new Set([...this.#changed].filter((o) => o !== owner)));
    this.#resets.set(owner, (this.#resets.get(owner) ?? 0) + 1);
    this.#resetListeners.notify();
  }

  /** Removes every value. */
  resetAll(): void {
    const changes = [...this.#values].flatMap(([owner, values]) =>
      changesOf(owner, values),
    );
    this.#values.clear();
    this.#notifyChanges(changes);
    if (this.#changed.size > 0) this.#setChanged(new Set());
    this.#allResets += 1;
    this.#resetListeners.notify();
  }

  /**
   * Moves the values of each slide to the index in `indices`, or removes them
   * if that is `undefined`, e.g., when slides were added or removed before it.
   * The values of the deck stay.
   */
  move(indices: readonly (number | undefined)[]): void {
    const moved = new Map<StateOwner, Values>();
    for (const [owner, values] of this.#values) {
      const index = owner === 'deck' ? owner : indices[owner];
      if (index !== undefined) moved.set(index, values);
    }
    const owners = new Set([...this.#values.keys(), ...moved.keys()]);
    const changes = [...owners].flatMap((owner) =>
      changesOf(owner, this.#values.get(owner), moved.get(owner)),
    );
    this.#values.clear();
    for (const [owner, values] of moved) this.#values.set(owner, values);
    this.#notifyChanges(changes);
    this.#setChanged(
      new Set(
        [...this.#changed].flatMap((owner) => {
          const index = owner === 'deck' ? owner : indices[owner];
          return index === undefined ? [] : [index];
        }),
      ),
    );
  }

  #family(owner: StateOwner, family: object): Map<string, unknown> {
    let values = this.#values.get(owner);
    if (values === undefined) {
      values = new Map();
      this.#values.set(owner, values);
    }
    let familyValues = values.get(family);
    if (familyValues === undefined) {
      familyValues = new Map();
      values.set(family, familyValues);
    }
    return familyValues;
  }

  #notify(owner: StateOwner, family: object, key: string): void {
    this.#listeners.get(family)?.notify(listenerKey(owner, key));
  }

  #notifyChanges(changes: readonly StateChange[]): void {
    if (changes.length === 0) return;
    this.#changeListeners.notify(changes);
    for (const { owner, family, key } of changes)
      this.#notify(owner, family, key);
  }

  #setChanged(changed: ReadonlySet<StateOwner>): void {
    this.#changed = changed;
    this.#changedListeners.notify();
  }
}

function listenerKey(owner: StateOwner, key: string): string {
  return `${String(owner)}\u0000${key}`;
}

/** The values that differ between `values` and `newValues` of the owner. */
function changesOf(
  owner: StateOwner,
  values: Values | undefined,
  newValues?: Values,
): StateChange[] {
  const families = new Set([
    ...(values?.keys() ?? []),
    ...(newValues?.keys() ?? []),
  ]);
  return [...families].flatMap((family) => {
    const old = values?.get(family);
    const current = newValues?.get(family);
    const keys = new Set([...(old?.keys() ?? []), ...(current?.keys() ?? [])]);
    return [...keys]
      .filter(
        (key) =>
          old?.has(key) !== current?.has(key) ||
          !Object.is(old?.get(key), current?.get(key)),
      )
      .map((key) => ({ owner, family, key }));
  });
}
