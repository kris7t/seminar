import {
  use,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { SlideStateUsageContext } from './StateUsageContext.ts';
import { useSlideView } from '../view/SlideViewContext.ts';
import {
  SlideStateContext,
  TransientSlideStateContext,
} from './SlideStateContext.ts';
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
  /**
   * Shares internal state, e.g., for mirroring, without a state marker or
   * reset button on the slide. Transient values start over on each visit,
   * aren't marked as changed, and are kept when the current slide or deck
   * is reset. Defaults to `false`.
   */
  transient?: boolean | undefined;
}

/** Scope of state outside of the views of a deck. */
const DETACHED_SCOPE = new StateScope('detached');

/**
 * Like `useState`, but the state belongs to the slide instead of the
 * component, so it is shared by every view of the slide, e.g., by the slide
 * shown to the audience and its thumbnail in the overview. Non-transient
 * state is kept when the slide is rendered again later; transient state
 * lasts for one visit.
 *
 * The state may be of any type, including objects that only exist while the
 * presentation runs, like a media stream that one view produces for the
 * others.
 */
export function useSlideState<T>(
  initial: T | (() => T),
  { key, transient = false }: SlideStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const persistentStore = use(SlideStateContext);
  const store =
    (transient ? use(TransientSlideStateContext) : undefined) ??
    persistentStore;
  const { index: viewIndex, stateIndex } = useSlideView();
  // Recaps share persistent state, but each visit has its own transient values.
  const index = transient ? viewIndex : (stateIndex ?? viewIndex);
  const recordUse = use(SlideStateUsageContext);
  if (!transient) recordUse?.(viewIndex, index);
  const scope = use(StateScopeContext) ?? DETACHED_SCOPE;
  const instanceId = useId();
  const stateKey =
    key === undefined
      ? `${scope.path}#${String(scope.indexOf(instanceId))}`
      : `${scope.path}/${key}`;
  const [initialValue] = useState(initial);
  const getValue = useCallback(
    () => store.getOrInit(index, stateKey, () => initialValue, transient) as T,
    [store, index, stateKey, initialValue, transient],
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
 * a reset button, so that every non-transient {@link useSlideState} of the
 * slide starts over from its initial value, and the slide is no longer
 * marked as changed. Transient values and the steps of the slide are kept.
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
