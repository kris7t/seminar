import type { SetStateAction } from 'react';

/** Options of a store of the deck, see {@link defineDeckStore}. */
export interface DeckStoreOptions<T, Key, Action> {
  /**
   * Returns the initial value of `key`, when a view first reads it. It runs
   * while rendering, so it must be pure. Without it, values are `undefined`
   * until they are set.
   */
  initial?: ((key: Key) => T) | undefined;
  /**
   * Returns the value of `key` after `action`, which is dispatched by the
   * function that {@link useStore} returns instead of a setter. It must be
   * pure. Defaults to taking a new value, or a function of the previous one,
   * like the setter of `useState`.
   */
  reduce?: ((state: T, action: Action, key: Key) => T) | undefined;
  /**
   * Identifies the store across hot reloads, which evaluate its definition
   * again, so that it keeps its values unless `initial` changes. The dev
   * server of `@seminar/vite-plugin` sets it, so it only needs to be set with
   * other tools.
   */
  id?: string | undefined;
}

/** Options of a store of slides, see {@link defineSlideStore}. */
export interface SlideStoreOptions<T, Key, Action> extends DeckStoreOptions<
  T,
  Key,
  Action
> {
  /**
   * Keeps the values of one visit to the slide, e.g., for mirroring, like
   * `useSlideState` with `transient: true`. Transient values start over on
   * each visit, and don't mark the slide as changed. Defaults to `false`.
   */
  transient?: boolean | undefined;
}

/**
 * Typed state that slides or the deck keep by key, created with
 * {@link defineSlideStore} or {@link defineDeckStore}, and read with
 * {@link useStore}. The definition identifies the state, so components that
 * share state import the same definition.
 */
export interface StoreDefinition<
  T,
  Key = undefined,
  Action = SetStateAction<T>,
> {
  readonly kind: 'slideStore' | 'deckStore';
  readonly transient: boolean;
  /** Tells apart the values of the store from those of other stores. */
  readonly family: object;
  readonly initial: (key: Key) => T;
  readonly reduce: (state: T, action: Action, key: Key) => T;
}

/** Applies an action of a `useState` setter. */
export function applyAction<T>(state: T, action: SetStateAction<T>): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(state)
    : action;
}

/** The latest definition of each store with an id, across hot reloads. */
const identified = new Map<string, { signature: string; family: object }>();

/** Returns the family of a store, which stays if its signature does. */
function familyOf(id: string | undefined, signature: string): object {
  if (id === undefined) return {};
  let entry = identified.get(id);
  if (entry?.signature !== signature) {
    entry = { signature, family: {} };
    identified.set(id, entry);
  }
  return entry.family;
}

function define(
  kind: 'slideStore' | 'deckStore',
  {
    initial = () => undefined,
    reduce = applyAction,
    transient = false,
    id,
  }: SlideStoreOptions<unknown, unknown, unknown>,
): StoreDefinition<unknown, unknown, unknown> {
  const signature = `${kind} ${String(transient)} ${String(initial)}`;
  const family = familyOf(id, signature);
  return { kind, transient, family, initial, reduce };
}

/**
 * Defines state that belongs to each slide, so every view of the slide and
 * its recaps share it, e.g., the slide shown to the audience and its
 * thumbnail in the overview. Each slide has a value for each key.
 *
 * The values are kept when the slide is left, unless they are transient. Reset
 * slide, or a function from `useResetSlideState`, resets them.
 */
export function defineSlideStore<
  T,
  Key = undefined,
  Action = SetStateAction<T>,
>(
  options: SlideStoreOptions<T, Key, Action> & {
    initial: (key: Key) => T;
  },
): StoreDefinition<T, Key, Action>;
export function defineSlideStore<
  T = undefined,
  Key = undefined,
  Action = SetStateAction<T | undefined>,
>(
  options?: SlideStoreOptions<T | undefined, Key, Action>,
): StoreDefinition<T | undefined, Key, Action>;
/* @__NO_SIDE_EFFECTS__ */
export function defineSlideStore(
  options: SlideStoreOptions<unknown, unknown, unknown> = {},
): StoreDefinition<unknown, unknown, unknown> {
  return define('slideStore', options);
}

/**
 * Defines state that belongs to the deck, so every slide shares it, e.g., to
 * show on one slide what the audience chose on another. The deck has a value
 * for each key.
 *
 * Reset deck in the menu resets the values.
 */
export function defineDeckStore<T, Key = undefined, Action = SetStateAction<T>>(
  options: DeckStoreOptions<T, Key, Action> & {
    initial: (key: Key) => T;
  },
): StoreDefinition<T, Key, Action>;
export function defineDeckStore<
  T = undefined,
  Key = undefined,
  Action = SetStateAction<T | undefined>,
>(
  options?: DeckStoreOptions<T | undefined, Key, Action>,
): StoreDefinition<T | undefined, Key, Action>;
/* @__NO_SIDE_EFFECTS__ */
export function defineDeckStore(
  options: DeckStoreOptions<unknown, unknown, unknown> = {},
): StoreDefinition<unknown, unknown, unknown> {
  const { initial, reduce, id } = options;
  return define('deckStore', { initial, reduce, id });
}
