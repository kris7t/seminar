import {
  use,
  useCallback,
  useEffect,
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
import { StepNode, type StepPhase } from './StepNode.ts';
import type { StepStatus } from './StepStore.ts';
import type { FadeProps, FadeValues } from '../transitions/fades.ts';
import { StepStoreContext } from './StepStoreContext.ts';
import { resolveStepSplit, type SplitProp } from './stepSplit.ts';

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
  /**
   * How the stepper looks as a whole, or `undefined` before it is placed, which
   * elements without a look of their own should look like.
   */
  look?: RankedAppearance | undefined;
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
  /** Attaches `element` to the stepper, with a look of its own, if given. */
  attach: (
    element: Element,
    appearances: RankedAppearances | undefined,
    ownLook: boolean,
  ) => () => void;
}

/**
 * How a stepper is linked to other steps:
 *
 * - `'self'` starts with a step of its own after the previous one, which is
 *   the default. Setting it explicitly also replaces the `with` or `joins` of
 *   the `defaults` of a `Step`, which stays nested by their `in`.
 * - `'previous'` shows its first step together with the previous step on the
 *   same level, whatever that is, e.g., to show two callouts at once. If there
 *   is none, it works like `'initial'`.
 * - `'content'` works like `'previous'`, but skips overlays, so it shows its
 *   first step together with the content on the same level so far.
 * - `'initial'` shows its first step as soon as the enclosing step (or the
 *   slide) is shown, as step 0 of the level, which has no state of its own. It
 *   stays current until the first step on the same level is shown. This allows
 *   using the same component for content that is visible up front and content
 *   revealed in steps.
 * - `'parent'` is part of what encloses the stepper, rather than a step, and
 *   so is whatever `'previous'` or `'content'` refers to it after it. A group
 *   placed like this is just a name for what encloses it.
 * - A {@link StepHandle}, e.g., created up front with {@link useStep} or
 *   {@link useSteps}, shares that stepper instead of creating a new one: the
 *   elements are attached to it and follow its state. This allows revealing
 *   content in several places, such as items of two lists, in parallel.
 *
 * By default, a stepper starts with a new step after the previous one.
 */
export type StepWith =
  'self' | 'previous' | 'content' | 'initial' | 'parent' | StepHandle;

export interface UseStepsOptions {
  /** See {@link StepWith}. */
  with?: StepWith | undefined;
  /**
   * Name of a stepper shared with the other steps of the group on the same
   * slide. This allows revealing content in several places in parallel, like
   * a {@link StepHandle} passed to `with`, but without creating the handle up
   * front.
   *
   * The stepper is placed at the first element of the group in document order,
   * according to the `count` and `with` of that element, and nested wherever
   * that element is. Elements without a look of their own look like it. Ignored
   * if `with` is a handle.
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
   * Like `with`, but only if the stepper doesn't join a group with other
   * elements.
   */
  defaultWith?: 'previous' | 'content' | 'initial' | undefined;
  /**
   * When the stepper is part of the step that `with` or `defaultWith` refers to,
   * rather than a step of its own, because it has no look of its own: `'target'`
   * if there is such a step, and `'always'` for being part of what encloses it
   * if there is none. `with: 'parent'` always is.
   */
  joins?: 'target' | 'always' | undefined;
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
  /**
   * Whether the element keeps its `appearances` if it isn't the first element
   * of the stepper, rather than looking like that one. Defaults to `true`.
   */
  ownLook?: boolean | undefined;
  /**
   * How long the slide fades when the turn of the stepper starts or ends
   * (see the `fade` of `Step`). Ignored if `with` is a handle.
   */
  fades?: FadeProps | undefined;
  /**
   * How the stepper asks for pages when the slide is split into pages, e.g.,
   * for a PDF (see {@link SplitProp}). Ignored if `with` is a handle.
   */
  split?: SplitProp | undefined;
  /**
   * What `split` leaves out, e.g., the usual mode of a component, which
   * takes precedence over the mode of the step the stepper is nested in.
   */
  defaultSplit?: SplitProp | undefined;
  /**
   * Whether the stepper may cover other content, which then also needs a page
   * without it when the slide is split into pages, e.g., callouts. Ignored if
   * `with` is a handle.
   */
  overlay?: boolean | undefined;
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
    defaultWith,
    joins,
    after,
    title,
    appearances,
    ownLook = true,
    fades: fadeProps,
    split: splitProp,
    defaultSplit,
    overlay,
  }: UseStepsOptions = {},
): StepHandle {
  // Only the values matter, which are often given as a new object.
  const { cut, fade, fadeIn, fadeOut, fadeBefore, fadeAfter } = fadeProps ?? {};
  const cutKey = Array.isArray(cut) ? cut.join(' ') : cut;
  const fades = useMemo<FadeValues | undefined>(
    () =>
      cutKey === undefined &&
      fade === undefined &&
      fadeIn === undefined &&
      fadeOut === undefined &&
      fadeBefore === undefined &&
      fadeAfter === undefined
        ? undefined
        : { cut: cutKey, fade, fadeIn, fadeOut, fadeBefore, fadeAfter },
    [cutKey, fade, fadeIn, fadeOut, fadeBefore, fadeAfter],
  );
  const splitKey = Array.isArray(splitProp) ? splitProp.join(' ') : splitProp;
  const defaultSplitKey = Array.isArray(defaultSplit)
    ? defaultSplit.join(' ')
    : defaultSplit;
  const split = useMemo(
    () => resolveStepSplit(splitKey, defaultSplitKey),
    [splitKey, defaultSplitKey],
  );
  const store = use(StepStoreContext);
  const manyParts = withStep === 'parent' && count > 1;
  useEffect(() => {
    if (manyParts) {
      console.warn(
        "Ignoring the `count` of a stepper with `with: 'parent'`, which isn't a step.",
      );
    }
  }, [manyParts]);
  const [ownNode] = useState(() => new StepNode());
  const node = group === undefined ? ownNode : store.getGroup(group);
  // Hooks can't be called conditionally, so we still create a node if we're
  // linked to another stepper, but never attach it or subscribe to it.
  const linked = typeof withStep === 'object';
  const placement =
    linked || withStep === 'self' ? 'next' : (withStep ?? 'next');
  const attach = useCallback(
    (
      element: Element,
      elementAppearances: RankedAppearances | undefined,
      elementOwnLook: boolean,
    ) =>
      store.attach(node, element, {
        count,
        placement,
        defaultPlacement: defaultWith,
        joins,
        parent,
        defaultParent: defaultIn,
        after,
        title,
        appearances: elementAppearances,
        ownLook: elementOwnLook,
        fades,
        split,
        overlay,
      }),
    [
      store,
      node,
      count,
      placement,
      defaultWith,
      joins,
      parent,
      defaultIn,
      after,
      title,
      fades,
      split,
      overlay,
    ],
  );
  const linkedAttach = linked ? withStep.attach : attach;
  const ref = useCallback<RefCallback<Element>>(
    (element) =>
      element === null
        ? undefined
        : linkedAttach(element, appearances, ownLook),
    [linkedAttach, appearances, ownLook],
  );
  const getStatus = linked ? getUnlinkedStatus : () => store.getStatus(node);
  const { stepIndex, phase, inherited, look } = useSyncExternalStore(
    linked ? subscribeUnlinked : store.subscribe,
    getStatus,
    getStatus,
  );
  const clampedIndex = Math.min(stepIndex, count - 1);
  const ownStep = useMemo(
    () => ({
      ref,
      attach,
      stepCount: count,
      stepIndex: clampedIndex,
      phase,
      isActive: phase !== 'future' && phase !== 'distantFuture',
      isCurrent: phase === 'current' || phase === 'open',
      inherited,
      look,
    }),
    [ref, attach, count, clampedIndex, phase, inherited, look],
  );
  const linkedStep = useMemo(
    () =>
      // Only elements with a look need to tell the stepper about it.
      linked && appearances !== undefined ? { ...withStep, ref } : undefined,
    [linked, withStep, ref, appearances],
  );
  return linkedStep ?? (linked ? withStep : ownStep);
}

/** Creates a stepper with a single step. See {@link useSteps}. */
export function useStep(options?: UseStepsOptions): StepHandle {
  return useSteps(1, options);
}
