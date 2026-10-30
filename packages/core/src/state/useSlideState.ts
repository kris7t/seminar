import {
  use,
  useEffect,
  useId,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { applyAction } from './defineStore.ts';
import { LAZY_INITIAL, StateScope, StateScopeContext } from './StateScope.ts';
import { useResetState, useStateValue } from './useStateValue.ts';

export interface SlideStateOptions {
  /**
   * Identifies the state within the slide (or the enclosing
   * {@link SlideStateNamespace}). Components that are mounted at the same time
   * need different keys.
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
   * and aren't marked as changed. Resets clear them, like other state. Defaults
   * to `false`.
   */
  transient?: boolean | undefined;
}

/** Scope of state outside of the views of a deck, where it can't be used. */
const DETACHED_SCOPE = new StateScope('detached');

/** Family of the values of {@link useSlideState}. */
const SLIDE_STATE = {};

function identity<T>(value: T): T {
  return value;
}

/**
 * Like `useState`, but the state belongs to the slide instead of the
 * component, so it is shared by every view of the slide, e.g., by the slide
 * shown to the audience and its thumbnail in the overview. Non-transient
 * state is kept when the slide is rendered again later; transient state
 * lasts for one visit.
 *
 * The state may be of any type.
 */
export function useSlideState<T>(
  initial: T | (() => T),
  { key, transient = false }: SlideStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const viewScope = use(StateScopeContext);
  const scope = viewScope ?? DETACHED_SCOPE;
  const instanceId = useId();
  const stateKey =
    key === undefined
      ? `${scope.path}#${String(scope.indexOf(instanceId))}`
      : `${scope.path}/${key}`;
  // Runs only when the state has no value, like the initial value of a store,
  // so after a reset, too. Another key is another state, with its initial value.
  const { getInitial, comparable } = useMemo(
    () =>
      typeof initial === 'function'
        ? { getInitial: initial as () => T, comparable: LAZY_INITIAL }
        : { getInitial: () => initial, comparable: initial },
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    [stateKey],
  );
  useEffect(
    () => viewScope?.claims.claim(stateKey, instanceId, comparable, transient),
    [viewScope, stateKey, instanceId, comparable, transient],
  );
  return useStateValue(
    transient ? 'visit' : 'slide',
    SLIDE_STATE,
    stateKey,
    getInitial,
    applyAction<T>,
    identity<T>,
  );
}

/**
 * Returns a function that resets the state of the enclosing slide, e.g., for
 * a reset button, so that every {@link useSlideState} and slide store of the
 * slide starts over from its initial value, including transient state, and
 * the slide is no longer marked as changed. It stays on its step.
 */
export function useResetSlideState(): () => void {
  return useResetState();
}
