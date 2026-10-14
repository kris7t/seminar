import {
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from 'react';

import { StepNode, type StepStatus } from './StepStore.ts';
import { StepStoreContext } from './StepStoreContext.ts';

/** State of a stepper. */
export interface StepState {
  /** Number of steps of the stepper. */
  stepCount: number;
  /**
   * Zero-based index of the current step of the stepper, or `-1` if the
   * stepper is not yet active. Once the presentation moves past the stepper,
   * this stays at the last step.
   */
  stepIndex: number;
  /** Whether at least the first step of the stepper is shown. */
  isActive: boolean;
  /** Whether the current step of the slide is one of the steps of the stepper. */
  isCurrent: boolean;
}

export interface StepHandle extends StepState {
  /**
   * Attach this ref to the elements of the stepper.
   *
   * The position of the elements in the document determines the order and the
   * nesting of steppers. The ref may be attached to multiple elements, e.g.,
   * to reveal several list items at once.
   */
  ref: RefCallback<Element>;
}

/**
 * How a stepper is linked to other steps:
 *
 * - `'previous'` shows its first step together with the previous stepper on
 *   the same level.
 * - `'first'` shows its first step as soon as the enclosing step (or the slide)
 *   is shown, without creating a new step. It stays current until the first
 *   step on the same level is shown. This allows using the same component for
 *   content that is visible up front and content revealed in steps.
 * - A {@link StepHandle}, e.g., created up front with {@link useStep} or
 *   {@link useSteps}, shares that stepper instead of creating a new one: the
 *   elements are attached to it and follow its state. This allows revealing
 *   content in several places, such as items of two lists, in parallel.
 *
 * By default, a stepper starts with a new step after the previous one.
 */
export type StepWith = 'previous' | 'first' | StepHandle;

export interface UseStepsOptions {
  /** See {@link StepWith}. */
  with?: StepWith | undefined;
}

const UNLINKED: StepStatus = { stepIndex: -1, isCurrent: false };

function subscribeUnlinked(): () => void {
  return () => undefined;
}

function getUnlinkedStatus(): StepStatus {
  return UNLINKED;
}

/**
 * Creates a stepper with `count` consecutive steps.
 *
 * The stepper is placed among the other steppers according to the position of
 * the elements that the returned `ref` is attached to.
 *
 * If `with` is a {@link StepHandle}, returns that handle instead, and `count`
 * is ignored.
 */
export function useSteps(
  count: number,
  { with: withStep }: UseStepsOptions = {},
): StepHandle {
  const store = use(StepStoreContext);
  const [node] = useState(() => new StepNode());
  // Hooks can't be called conditionally, so we still create a node if we're
  // linked to another stepper, but never attach it or subscribe to it.
  const linked = typeof withStep === 'object';
  const placement = linked ? 'next' : (withStep ?? 'next');
  const ref = useCallback<RefCallback<Element>>(
    (element) =>
      element === null
        ? undefined
        : store.attach(node, element, { count, placement }),
    [store, node, count, placement],
  );
  const { stepIndex, isCurrent } = useSyncExternalStore(
    linked ? subscribeUnlinked : store.subscribe,
    linked ? getUnlinkedStatus : () => store.getStatus(node),
  );
  const clampedIndex = Math.min(stepIndex, count - 1);
  const ownStep = useMemo(
    () => ({
      ref,
      stepCount: count,
      stepIndex: clampedIndex,
      isActive: clampedIndex >= 0,
      isCurrent,
    }),
    [ref, count, clampedIndex, isCurrent],
  );
  return linked ? withStep : ownStep;
}

/** Creates a stepper with a single step. See {@link useSteps}. */
export function useStep(options?: UseStepsOptions): StepHandle {
  return useSteps(1, options);
}
