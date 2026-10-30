import {
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
} from 'react';

import { DEFAULT_VIEW, SlideViewContext } from '../view/SlideViewContext.ts';
import type { StoreScope } from './defineStore.ts';
import type { StateOwner, StateStore } from './StateStore.ts';
import { useStateStores } from './StateStoresContext.ts';

/**
 * Returns a function that selects from the value, but only again if the value
 * changes, since a new selection of the same value could render again forever.
 */
function selector<T, Selected>(
  getValue: () => T,
  select: (state: T) => Selected,
): () => Selected {
  let last: { value: T; selected: Selected } | undefined;
  return () => {
    const value = getValue();
    if (last === undefined || !Object.is(last.value, value)) {
      last = { value, selected: select(value) };
    }
    return last.selected;
  };
}

/** Returns the store and the owner of the values of the enclosing view. */
function useStateOwner(scope: StoreScope): [StateStore, StateOwner] {
  const stores = useStateStores();
  const view = use(SlideViewContext);
  const { index, stateIndex } = view;
  if (scope !== 'deck' && view === DEFAULT_VIEW)
    throw new Error(
      'Slide state requires a slide. Use a deck store outside of slides.',
    );
  switch (scope) {
    case 'deck':
      return [stores.deck, 'deck'];
    case 'slide':
      // Recaps share the state of the slide they recap.
      return [stores.slides, stateIndex ?? index];
    case 'transient':
      return [stores.transient, index];
  }
}

/**
 * Like `useReducer`, but the value of `key` in `family` is kept in the store
 * of `scope`, initialized with `initial` if given, and the result is the
 * value picked by `select`. The component only renders again if that changes.
 * `initial` and `reduce` must not change while the key stays the same.
 */
export function useStateValue<T, Action, Selected>(
  scope: StoreScope,
  family: object,
  key: string,
  initial: (() => T) | undefined,
  reduce: (state: T, action: Action) => T,
  select: (state: T) => Selected,
): [Selected, Dispatch<Action>] {
  const [store, owner] = useStateOwner(scope);
  const { recordUse } = useStateStores();
  const { index } = use(SlideViewContext);
  if (scope !== 'transient') recordUse?.(index, owner, family, key);
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
 * which its recaps share, including its transient state.
 */
export function useResetState(): () => void {
  const [transientStore, transientOwner] = useStateOwner('transient');
  const [store, owner] = useStateOwner('slide');
  return useCallback(() => {
    transientStore.reset(transientOwner);
    store.reset(owner);
  }, [transientStore, transientOwner, store, owner]);
}
