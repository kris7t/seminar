import {
  use,
  useId,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { StateScope, StateScopeContext } from './StateScope.ts';
import { useResetState, useStateValue } from './useStateValue.ts';

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
   * aren't marked as changed, and are kept when the current slide is reset.
   * Reset deck clears them along with all other slide state. Defaults to `false`.
   */
  transient?: boolean | undefined;
}

/** Scope of state outside of the views of a deck. */
const DETACHED_SCOPE = new StateScope('detached');

/** Family of the values of {@link useSlideState}. */
const SLIDE_STATE = {};

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
  const scope = use(StateScopeContext) ?? DETACHED_SCOPE;
  const instanceId = useId();
  const stateKey =
    key === undefined
      ? `${scope.path}#${String(scope.indexOf(instanceId))}`
      : `${scope.path}/${key}`;
  const [initialValue] = useState(() => {
    const value =
      typeof initial === 'function' ? (initial as () => T)() : initial;
    return () => value;
  });
  return useStateValue(
    transient ? 'visit' : 'slide',
    SLIDE_STATE,
    stateKey,
    initialValue,
  );
}

/**
 * Returns a function that resets the state of the enclosing slide, e.g., for
 * a reset button, so that every non-transient {@link useSlideState} of the
 * slide starts over from its initial value, and the slide is no longer
 * marked as changed. Transient values and the steps of the slide are kept.
 */
export function useResetSlideState(): () => void {
  return useResetState();
}
