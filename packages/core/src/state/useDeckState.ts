import {
  use,
  useCallback,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { DeckStateContext } from './DeckStateContext.ts';
import { DeckStateUsageContext } from './DeckStateUsageContext.ts';
import { SlideViewContext } from '../view/SlideViewContext.ts';

/**
 * Like `useState`, but the state belongs to the deck, so every slide that
 * uses the same `key` shares it, e.g., to show on one slide what the audience
 * chose on another.
 *
 * The state is `undefined` until it is set, so that every slide that uses it
 * starts from the same value. Setting it to `undefined` resets it. The
 * presenter resets the state of the deck with Reset deck in the menu.
 */
export function useDeckState<T>(
  key: string,
): [T | undefined, Dispatch<SetStateAction<T | undefined>>] {
  const store = use(DeckStateContext);
  const recordUse = use(DeckStateUsageContext);
  const view = use(SlideViewContext);
  recordUse?.(view.index);
  const getValue = useCallback(
    () => store.get(key) as T | undefined,
    [store, key],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const value = useSyncExternalStore(subscribe, getValue);
  const setValue = useCallback<Dispatch<SetStateAction<T | undefined>>>(
    (action) => {
      store.set(
        key,
        typeof action === 'function'
          ? (action as (previous: T | undefined) => T | undefined)(getValue())
          : action,
      );
    },
    [store, key, getValue],
  );
  return [value, setValue];
}
