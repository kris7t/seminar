import {
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
} from 'react';

import { SlideViewContext } from '../view/SlideViewContext.ts';
import type { StateOwner, StateStore } from './StateStore.ts';
import { useStateStores } from './StateStoresContext.ts';

/**
 * Who shares a value: every slide of the deck, every view of a slide and its
 * recaps, or the views of one visit to a slide.
 */
export type StateLocation = 'deck' | 'slide' | 'visit';

/**
 * Returns a function that selects from the value, but only again if the value
 * changes, so that a new selection of the same value doesn't render again.
 */
function selector<T, Selected>(
  getValue: () => T,
  select: (state: T) => Selected,
): () => Selected {
  let last: { value: T; selected: Selected } | undefined;
  return () => {
    const value = getValue();
    if (last === undefined || !Object.is(last.value, value)) {
      const selected = select(value);
      last = {
        value,
        selected:
          last !== undefined && Object.is(last.selected, selected)
            ? last.selected
            : selected,
      };
    }
    return last.selected;
  };
}

/** Returns the store and the owner of the values of the enclosing view. */
function useStateOwner(location: StateLocation): [StateStore, StateOwner] {
  const stores = useStateStores();
  const { index, stateIndex } = use(SlideViewContext);
  switch (location) {
    case 'deck':
      return [stores.deck, 'deck'];
    case 'slide':
      // Recaps share the state of the slide they recap.
      return [stores.slides, stateIndex ?? index];
    case 'visit':
      // But each visit to a recap has its own.
      return [stores.visit, index];
  }
}

/**
 * Like `useReducer`, but the value of `key` in `family` is kept in the store
 * of `location`, initialized with `initial` if given, and the result is the
 * value picked by `select`. The component only renders again if that changes.
 * `initial` and `reduce` must not change while the key stays the same.
 */
export function useStateValue<T, Action, Selected>(
  location: StateLocation,
  family: object,
  key: string,
  initial: (() => T) | undefined,
  reduce: (state: T, action: Action) => T,
  select: (state: T) => Selected,
): [Selected, Dispatch<Action>] {
  const [store, owner] = useStateOwner(location);
  const { recordUse } = useStateStores();
  const { index } = use(SlideViewContext);
  if (location !== 'visit') recordUse?.(index, owner, family, key);
  const getValue = useCallback(
    () =>
      (initial === undefined
        ? store.get(owner, family, key)
        : store.getOrInit(owner, family, key, initial)) as T,
    [store, owner, family, key, initial],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(owner, family, key, listener),
    [store, owner, family, key],
  );
  const getSelected = useMemo(
    () => selector(getValue, select),
    [getValue, select],
  );
  const selected = useSyncExternalStore(subscribe, getSelected, getSelected);
  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      store.set(owner, family, key, reduce(getValue(), action));
    },
    [store, owner, family, key, reduce, getValue],
  );
  return [selected, dispatch];
}

/**
 * Returns a function that resets the state of the slide of the enclosing view,
 * which its recaps share.
 */
export function useResetState(): () => void {
  const [store, owner] = useStateOwner('slide');
  return useCallback(() => {
    store.reset(owner);
  }, [store, owner]);
}
