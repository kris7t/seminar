import {
  use,
  useEffect,
  useId,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { applyAction, type StoreScope } from './defineStore.ts';
import {
  LAZY_INITIAL,
  StateNamespace,
  StateNamespaceContext,
} from './StateNamespace.ts';
import { useResetState, useStateValue } from './useStateValue.ts';

export interface SlideStateOptions {
  /**
   * Identifies the state within the slide (or the enclosing
   * {@link SlideStateNamespace}). Components that are mounted at the same time
   * need different ids.
   *
   * Without an id, the state is identified by the order in which the
   * components of the slide first render, which is the same in every view of
   * the slide as long as the component mounts along with the slide. Pass an id
   * if the component mounts later, e.g., when a tab is selected.
   */
  id?: string | undefined;
  /**
   * Who shares the state: `'slide'` keeps it with the slide, and `'transient'`
   * keeps the views of the slide in sync without saving anything, so it starts
   * over when the slide is shown again, and doesn't mark the slide as changed.
   * Defaults to `'slide'`. Use a store for state that the deck shares.
   */
  scope?: Exclude<StoreScope, 'deck'> | undefined;
}

/** Namespace of state outside of the views of a deck, where it can't be used. */
const DETACHED_NAMESPACE = new StateNamespace('detached');

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
 * only keeps the views in sync.
 *
 * The state may be of any type.
 */
export function useSlideState<T>(
  initial: T | (() => T),
  { id, scope = 'slide' }: SlideStateOptions = {},
): [T, Dispatch<SetStateAction<T>>] {
  const viewNamespace = use(StateNamespaceContext);
  const namespace = viewNamespace ?? DETACHED_NAMESPACE;
  const instanceId = useId();
  const stateId =
    id === undefined
      ? `${namespace.path}#${String(namespace.indexOf(instanceId))}`
      : `${namespace.path}/${id}`;
  // Runs only when the state has no value, like the initial value of a store,
  // so after a reset, too. Another id is another state, with its initial value.
  const { getInitial, comparable } = useMemo(
    () =>
      typeof initial === 'function'
        ? { getInitial: initial as () => T, comparable: LAZY_INITIAL }
        : { getInitial: () => initial, comparable: initial },
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    [stateId],
  );
  useEffect(
    () => viewNamespace?.claims.claim(stateId, instanceId, comparable, scope),
    [viewNamespace, stateId, instanceId, comparable, scope],
  );
  return useStateValue(
    scope,
    SLIDE_STATE,
    stateId,
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
