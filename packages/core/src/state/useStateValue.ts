import {
  use,
  useCallback,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { SlideViewContext } from '../view/SlideViewContext.ts';
import type { StateOwner, StateStore } from './StateStore.ts';
import { StateStoresContext } from './StateStoresContext.ts';

/**
 * Who shares a value: every slide of the deck, every view of a slide and its
 * recaps, or the views of one visit to a slide.
 */
export type StateLocation = 'deck' | 'slide' | 'visit';

/** Returns the store and the owner of the values of the enclosing view. */
function useStateOwner(location: StateLocation): [StateStore, StateOwner] {
  const stores = use(StateStoresContext);
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
 * Like `useState`, but the value of `key` in `family` is kept in the store of
 * `location`, initialized with `initial` if given. `initial` must not change.
 */
export function useStateValue<T>(
  location: StateLocation,
  family: object,
  key: string,
  initial?: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [store, owner] = useStateOwner(location);
  const { recordUse } = use(StateStoresContext);
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
  const value = useSyncExternalStore(subscribe, getValue, getValue);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      store.set(
        owner,
        family,
        key,
        typeof action === 'function'
          ? (action as (previous: T) => T)(getValue())
          : action,
      );
    },
    [store, owner, family, key, getValue],
  );
  return [value, setValue];
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
