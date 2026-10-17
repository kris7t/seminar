import {
  use,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { useSlideView } from '../view/SlideViewContext.ts';
import { SlideStateContext } from './SlideStateContext.ts';
import { StateScope, StateScopeContext } from './StateScope.ts';

export interface SlideStateOptions {
  /**
   * Identifies the state within the slide (or the enclosing
   * {@link SlideStateScope}).
   *
   * Without a key, the state is identified by the order in which the
   * components of the slide first render, which is the same in every view of
   * the slide as long as the component mounts along with the slide. Pass a key
   * if the component mounts later, e.g., when a tab is selected.
   */
  key?: string | undefined;
}

/** Scope of state outside of the views of a deck. */
const DETACHED_SCOPE = new StateScope('detached');

/**
 * Like `useState`, but the state belongs to the slide instead of the
 * component, so it is shared by every view of the slide, e.g., by the slide
 * shown to the audience and its thumbnail in the overview, and it is kept when
 * the slide is rendered again later.
 *
 * The state may be of any type, including objects that only exist while the
 * presentation runs, like a media stream that one view produces for the
 * others.
 */
export function useSlideState<T>(
  initial: T | (() => T),
  { key }: SlideStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const store = use(SlideStateContext);
  const { index: viewIndex, stateIndex } = useSlideView();
  // Recaps share the state of the slide they recap.
  const index = stateIndex ?? viewIndex;
  const scope = use(StateScopeContext) ?? DETACHED_SCOPE;
  const instanceId = useId();
  const stateKey =
    key === undefined
      ? `${scope.path}#${String(scope.indexOf(instanceId))}`
      : `${scope.path}/${key}`;
  const [initialValue] = useState(initial);
  const getValue = useCallback(
    () => store.getOrInit(index, stateKey, () => initialValue) as T,
    [store, index, stateKey, initialValue],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(index, stateKey, listener),
    [store, index, stateKey],
  );
  const value = useSyncExternalStore(subscribe, getValue);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      store.set(
        index,
        stateKey,
        typeof action === 'function'
          ? (action as (previous: T) => T)(getValue())
          : action,
      );
    },
    [store, index, stateKey, getValue],
  );
  return [value, setValue];
}

/**
 * Returns a function that resets the state of the enclosing slide, e.g., for
 * a reset button, so that every {@link useSlideState} of the slide starts
 * over from its initial value, and the slide is no longer marked as changed.
 * The steps of the slide are kept.
 */
export function useResetSlideState(): () => void {
  const store = use(SlideStateContext);
  const { index: viewIndex, stateIndex } = useSlideView();
  // Recaps share the state of the slide they recap.
  const index = stateIndex ?? viewIndex;
  return useCallback(() => {
    store.reset(index);
  }, [store, index]);
}
