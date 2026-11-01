import { useTheme } from '@mui/material/styles';
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
  appearancesOfBehavior,
  SHOWN,
  splitShorthands,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import { StepBehaviorContext } from './StepBehaviorContext.ts';
import { StepNode, type StepPhase } from './StepNode.ts';
import type { StepBehaviorShorthands, StepProps } from './Step.tsx';
import type { StepStatus } from './StepStore.ts';
import type { FadeProps, FadeValues } from '../transitions/fades.ts';
import { StepStoreContext } from './StepStoreContext.ts';
import { parseOverlay, resolveStepSplit } from './stepSplit.ts';

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
   * How the step that the stepper is nested in appears, which the stepper
   * should be at least as hidden as.
   */
  inherited: RankedAppearance;
  /**
   * How the elements of this call should appear, apart from what they inherit,
   * according to their behavior, the step they are part of, or the first element
   * of the stepper.
   */
  appearance: RankedAppearance;
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
  /**
   * How the stepper appears as a whole, or `undefined` before it is placed, which
   * elements linked to it follow unless they have a behavior of their own.
   */
  stepperAppearance?: RankedAppearance | undefined;
  /**
   * Attaches `element` to the stepper, with its own appearances, if given, or
   * else with what the stepper should do if there's nothing else to follow.
   */
  attach: (
    element: Element,
    appearances: RankedAppearances | undefined,
    defaultAppearances: RankedAppearances | undefined,
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

/**
 * The props of `Step` that decide where a stepper goes and how it appears, which
 * work the same way here, so a component can pass its `StepProps` on as they are.
 * The `group` is placed at its first element in document order, and the others
 * follow it unless they have a behavior of their own. If `with` is a handle, only
 * the behavior counts.
 */
export type UseStepsOptions = Pick<
  StepProps,
  | 'with'
  | 'step'
  | 'initial'
  | 'id'
  | 'group'
  | 'in'
  | 'after'
  | 'title'
  | 'defaults'
  | 'behavior'
  | 'split'
  | 'overlay'
  | keyof FadeProps
  | keyof StepBehaviorShorthands
>;

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
 * Creates a stepper with `count` consecutive steps, which takes the same options
 * as `Step`.
 *
 * The stepper is placed among the other steppers according to the position of
 * the elements that the returned `ref` is attached to. The elements aren't styled
 * for you, so apply `appearance` and `inherited` if they should appear like a
 * `Step`, or pass the behavior `always` for content that stays shown, which the
 * steps nested in it and the pages of the slide then rely on.
 *
 * If `with` is a {@link StepHandle}, shares that stepper, and `count` is ignored.
 */
export function useSteps(
  count: number,
  options: UseStepsOptions = {},
): StepHandle {
  const {
    with: withProp,
    step: stepProp,
    initial,
    id,
    group = id,
    in: parent,
    after,
    title,
    defaults,
    behavior: ownBehavior,
    split: splitProp,
    overlay: ownOverlay,
    cut,
    fade,
    fadeIn,
    fadeOut,
    fadeBefore,
    fadeAfter,
  } = options;
  const theme = useTheme();
  const slideBehavior = use(StepBehaviorContext);
  const withStep =
    withProp ??
    (initial === true || initial === ''
      ? 'initial'
      : stepProp === true || stepProp === ''
        ? 'self'
        : stepProp === false || stepProp === 'false'
          ? 'parent'
          : undefined);
  const writtenBehavior = ownBehavior ?? splitShorthands(theme, options)[0];
  const ignoredBehavior = withStep === 'parent' ? writtenBehavior : undefined;
  useEffect(() => {
    if (ignoredBehavior !== undefined) {
      console.warn(
        `Ignoring the behavior \`${ignoredBehavior}\` of content with \`with="parent"\` or \`step={false}\`, which isn't a step.`,
      );
    }
  }, [ignoredBehavior]);
  const manyParts = withStep === 'parent' && count > 1;
  useEffect(() => {
    if (manyParts) {
      console.warn(
        "Ignoring the `count` of a stepper with `with: 'parent'`, which isn't a step.",
      );
    }
  }, [manyParts]);
  const chosenBehavior = writtenBehavior ?? defaults?.behavior;
  // What isn't a step always appears like what encloses it.
  const appearances =
    chosenBehavior === undefined || withStep === 'parent'
      ? undefined
      : appearancesOfBehavior(theme, chosenBehavior);
  // The behavior of the slide takes precedence over the default of the theme.
  const defaultAppearances = appearancesOfBehavior(
    theme,
    slideBehavior ??
      theme.components?.SeminarStep?.defaultProps?.behavior ??
      'reveal',
  );
  // Only the values matter, which are often given as a new object.
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
  const defaultSplit = defaults?.split;
  const defaultSplitKey = Array.isArray(defaultSplit)
    ? defaultSplit.join(' ')
    : defaultSplit;
  const split = useMemo(
    () => resolveStepSplit(splitKey, defaultSplitKey),
    [splitKey, defaultSplitKey],
  );
  const store = use(StepStoreContext);
  const [ownNode] = useState(() => new StepNode());
  const node = group === undefined ? ownNode : store.getGroup(group);
  // Hooks can't be called conditionally, so we still create a node if we're
  // linked to another stepper, but never attach it or subscribe to it.
  const linked = typeof withStep === 'object';
  const placement =
    linked || withStep === 'self' ? 'next' : (withStep ?? 'next');
  const placed = parent !== undefined || after !== undefined;
  // Placing it otherwise replaces the default of its place.
  const defaultPlace = withStep === undefined && !placed ? defaults : undefined;
  // A behavior gives it a step instead of always being shown with one.
  const defaultJoins =
    appearances === undefined ? defaultPlace?.joins : undefined;
  const defaultWith = defaultPlace?.with;
  const defaultIn = placed ? undefined : defaults?.in;
  const overlay = parseOverlay(ownOverlay) ?? parseOverlay(defaults?.overlay);
  const attach = useCallback(
    (
      element: Element,
      elementAppearances: RankedAppearances | undefined,
      elementDefaultAppearances: RankedAppearances | undefined,
    ) =>
      store.attach(node, element, {
        count,
        placement,
        defaults: { with: defaultWith, joins: defaultJoins, in: defaultIn },
        parent,
        after,
        title,
        appearances: elementAppearances,
        defaultAppearances: elementDefaultAppearances,
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
      defaultJoins,
      defaultIn,
      parent,
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
        : linkedAttach(element, appearances, defaultAppearances),
    [linkedAttach, appearances, defaultAppearances],
  );
  const getStatus = linked ? getUnlinkedStatus : () => store.getStatus(node);
  const {
    stepIndex,
    phase,
    inherited,
    appearance: stepperAppearance,
  } = useSyncExternalStore(
    linked ? subscribeUnlinked : store.subscribe,
    getStatus,
    getStatus,
  );
  const clampedIndex = Math.min(stepIndex, count - 1);
  const ownAppearance =
    appearances?.[phase] ?? stepperAppearance ?? defaultAppearances[phase];
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
      appearance: ownAppearance,
      stepperAppearance,
    }),
    [
      ref,
      attach,
      count,
      clampedIndex,
      phase,
      inherited,
      ownAppearance,
      stepperAppearance,
    ],
  );
  const linkedAppearance = linked
    ? (appearances?.[withStep.phase] ??
      withStep.stepperAppearance ??
      defaultAppearances[withStep.phase])
    : undefined;
  const linkedStep = useMemo(
    () =>
      linked && linkedAppearance !== undefined
        ? { ...withStep, ref, appearance: linkedAppearance }
        : undefined,
    [linked, withStep, ref, linkedAppearance],
  );
  return linkedStep ?? ownStep;
}

/** Creates a stepper with a single step. See {@link useSteps}. */
export function useStep(options?: UseStepsOptions): StepHandle {
  return useSteps(1, options);
}
