import {
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from 'react';

import {
  SHOWN,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import { StepNode, type StepPhase, type StepStatus } from './StepStore.ts';
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
  /** Where the presentation is relative to the stepper. */
  phase: StepPhase;
  /** Whether at least the first step of the stepper is shown. */
  isActive: boolean;
  /**
   * Whether the current step of the slide is one of the steps of the stepper,
   * or nested inside it.
   */
  isCurrent: boolean;
  /**
   * How the step that the stepper is nested in looks, which the stepper
   * should look at least as hidden as.
   */
  inherited: RankedAppearance;
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
 * - `'self'` starts with a step of its own after the previous one, which is
 *   the default. Setting it explicitly also places a `Step` where it is,
 *   rather than in its `defaultIn`.
 * - `'previous'` shows its first step together with the previous stepper on
 *   the same level. If there is no previous stepper on the level, it works
 *   like `'initial'`.
 * - `'initial'` shows its first step as soon as the enclosing step (or the slide)
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
export type StepWith = 'self' | 'previous' | 'initial' | StepHandle;

export interface UseStepsOptions {
  /** See {@link StepWith}. */
  with?: StepWith | undefined;
  /**
   * Name of a stepper shared with the other steps of the group on the same
   * slide. This allows revealing content in several places in parallel, like
   * a {@link StepHandle} passed to `with`, but without creating the handle up
   * front.
   *
   * The stepper is placed at the least nested element of the group (the
   * first one in document order if there are several), according to the
   * `count` and `with` of that element. Thus, an element nested inside
   * another step can join a group of the enclosing level, but it is only shown
   * once both the group and the enclosing step are shown. Ignored if `with` is
   * a handle.
   */
  group?: string | undefined;
  /**
   * Name of the group whose stepper this stepper is nested in, as if its
   * elements were inside the elements of the group. This allows nesting steps,
   * e.g., callouts, outside of the step they belong to. An element nests the
   * stepper in the stepper of the element, or the stepper enclosing it, e.g.,
   * for callouts pointing at the element. Ignored if `with` is a handle.
   */
  in?: string | Element | undefined;
  /**
   * Like `in`, but only if the stepper doesn't join a group with other
   * elements. Ignored if `with` is a handle.
   */
  defaultIn?: string | Element | undefined;
  /**
   * Name of the group to place this stepper right after, nested in the same
   * stepper as the group, before the steppers that follow the group in
   * document order. Steppers placed after the same group follow each other in
   * document order. Takes precedence over `in`. Ignored if `with` is a handle.
   */
  after?: string | undefined;
  /**
   * Title of the stepper in the tree of steps, instead of the text of its
   * elements. Ignored if `with` is a handle.
   */
  title?: string | undefined;
  /**
   * How the stepper looks in each phase, which the steppers nested in it
   * inherit. Shown in all phases by default.
   */
  appearances?: RankedAppearances | undefined;
}

const UNLINKED: StepStatus = {
  stepIndex: -1,
  phase: 'future',
  inherited: SHOWN,
};

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
  {
    with: withStep,
    group,
    in: parent,
    defaultIn,
    after,
    title,
    appearances,
  }: UseStepsOptions = {},
): StepHandle {
  const store = use(StepStoreContext);
  const [ownNode] = useState(() => new StepNode());
  const node = group === undefined ? ownNode : store.getGroup(group);
  // Hooks can't be called conditionally, so we still create a node if we're
  // linked to another stepper, but never attach it or subscribe to it.
  const linked = typeof withStep === 'object';
  const placement =
    linked || withStep === 'self' ? 'next' : (withStep ?? 'next');
  const ref = useCallback<RefCallback<Element>>(
    (element) =>
      element === null
        ? undefined
        : store.attach(node, element, {
            count,
            placement,
            parent,
            defaultParent: defaultIn,
            after,
            title,
            appearances,
          }),
    [
      store,
      node,
      count,
      placement,
      parent,
      defaultIn,
      after,
      title,
      appearances,
    ],
  );
  const { stepIndex, phase, inherited } = useSyncExternalStore(
    linked ? subscribeUnlinked : store.subscribe,
    linked ? getUnlinkedStatus : () => store.getStatus(node),
  );
  const clampedIndex = Math.min(stepIndex, count - 1);
  const ownStep = useMemo(
    () => ({
      ref,
      stepCount: count,
      stepIndex: clampedIndex,
      phase,
      isActive: phase !== 'future' && phase !== 'distantFuture',
      isCurrent: phase === 'current' || phase === 'open',
      inherited,
    }),
    [ref, count, clampedIndex, phase, inherited],
  );
  return linked ? withStep : ownStep;
}

/** Creates a stepper with a single step. See {@link useSteps}. */
export function useStep(options?: UseStepsOptions): StepHandle {
  return useSteps(1, options);
}
