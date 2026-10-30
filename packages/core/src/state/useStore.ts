import { useCallback, useMemo, type Dispatch } from 'react';

import { StructuralKeys } from '../shared/StructuralKeys.ts';
import type { StoreDefinition } from './defineStore.ts';
import { useStateValue } from './useStateValue.ts';

/** Options of {@link useStore}. */
export interface UseStoreOptions<T, Key, Selected> {
  /**
   * The key of the value in the store. Plain objects and arrays are compared
   * structurally; other objects and functions are compared by identity.
   */
  key?: Key;
  /**
   * Picks the part of the value that the component uses, so that it only
   * renders again if that changes.
   */
  select?: ((state: T) => Selected) | undefined;
}

const keys = new StructuralKeys();

function identity<T>(value: T): T {
  return value;
}

/**
 * Like `useReducer`, but the value belongs to a slide or the deck, see
 * {@link defineSlideStore} and {@link defineDeckStore}. Returns the value of
 * the key in the store, or the part of it that `select` picks, and a function
 * that sets it, or dispatches an action to the reducer of the store.
 */
export function useStore<T, Action, Selected = T>(
  definition: StoreDefinition<T, undefined, Action>,
  options?: UseStoreOptions<T, undefined, Selected>,
): [Selected, Dispatch<Action>];
export function useStore<T, Key, Action, Selected = T>(
  definition: StoreDefinition<T, Key, Action>,
  options: UseStoreOptions<T, Key, Selected> & { key: Key },
): [Selected, Dispatch<Action>];
export function useStore<T, Key, Action, Selected>(
  definition: StoreDefinition<T, Key, Action>,
  { key, select }: UseStoreOptions<T, Key, Selected> = {},
): [Selected, Dispatch<Action>] {
  const encodedKey = keys.of(key);
  // Structurally equal keys are the same key.
  // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  const stableKey = useMemo(() => key as Key, [encodedKey]);
  const initial = useCallback(
    () => definition.initial(stableKey),
    [definition, stableKey],
  );
  const reduce = useCallback(
    (state: T, action: Action) => definition.reduce(state, action, stableKey),
    [definition, stableKey],
  );
  return useStateValue(
    definition.kind === 'deckStore'
      ? 'deck'
      : definition.transient
        ? 'visit'
        : 'slide',
    definition.family,
    encodedKey,
    initial,
    reduce,
    select ?? (identity as (state: T) => Selected),
  );
}
