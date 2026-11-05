import { useTheme } from '@mui/material/styles';
import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from 'react';

import { getDevChannel } from '../host/devChannel.ts';
import { findSourceRange } from '../host/sourceRanges.ts';
import {
  resolveElementAppearance,
  resolveStepperAppearances,
  resolveStepperPlace,
  resolveStepperWith,
} from './resolveStepper.ts';
import {
  appearanceClass,
  SHOWN,
  StepAppearanceContext,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import { StepBehaviorContext } from './StepBehaviorContext.ts';
import { StepNode, type StepPhase } from './StepNode.ts';
import type { StepBehavior, StepBehaviorShorthands } from './Step.tsx';
import type { StepDefaults } from './stepDefaults.ts';
import type { OverlayProp, SplitProp } from './stepSplit.ts';
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
   * How the elements of this call should appear, according to their behavior, the
   * step they are part of or nested in, or the first element of the stepper.
   */
  appearance: RankedAppearance;
  /**
   * The class that makes the elements appear like this on a slide, or `undefined`
   * if they already do, because of the elements around them. Elements with steps
   * inside them should pass `appearance` to `StepAppearanceContext`, so that those
   * steps don't apply the same appearance again.
   */
  className: string | undefined;
}

export interface StepHandle extends StepState {
  /** The stepper, which the elements of calls with this handle are part of. */
  stepper: StepNode;
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
 *   first step together with the content on the same level so far. If there is
 *   none, it works like `'initial'`.
 * - `'initial'` shows its first step as soon as the enclosing step (or the
 *   slide) is shown, as step 0 of the level, which has no state of its own. It
 *   stays current until the first step on the same level is shown. This allows
 *   using the same component for content that is visible up front and content
 *   revealed in steps.
 * - `'parent'` is part of what encloses the stepper, rather than a step, so what
 *   comes after it has nothing to be placed with. A group placed like this is
 *   just a name for what encloses it.
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
 * the behavior counts. These are also the attributes of `:step` in MDX.
 */
export interface UseStepsOptions extends StepBehaviorShorthands, FadeProps {
  /**
   * See {@link StepWith}.
   */
  with?: StepWith | undefined;
  /**
   * Name of the element of the step on the slide, which gets an id unique in
   * the document (see `useSlideElementId`). The step joins the group of the
   * same name, unless `group` is set.
   */
  id?: string | undefined;
  /** See the `group` option of `useSteps`. Defaults to `id`. */
  group?: string | undefined;
  /**
   * Name of the group to nest the step in, as if it was inside the elements of
   * the group, or an element whose step to nest it in. See the `in` option of
   * `useSteps`.
   */
  in?: string | Element | undefined;
  /** See the `after` option of `useSteps`. */
  after?: string | undefined;
  /**
   * Shows the step with a step of its own, like `with="self"`, e.g., `step`
   * in a directive, or makes it not a step if `false`, like `with="parent"`,
   * e.g., `step=false` in a directive. Ignored if `with` is set.
   */
  step?: boolean | undefined;
  /**
   * Shows the step as soon as what encloses it is shown, like
   * `with="initial"`, e.g., `initial` in a directive. Takes precedence over
   * `step`, and is ignored if `with` is set.
   */
  initial?: boolean | undefined;
  /**
   * What the step does unless the user says otherwise (see
   * {@link StepDefaults}), which wrapper components can use to choose their
   * usual place and behavior.
   */
  defaults?: StepDefaults | undefined;
  /**
   * Title of the step in the tree of steps, instead of its text. Unlike the
   * HTML attribute, it isn't shown as a tooltip.
   */
  title?: string | undefined;
  /**
   * How the step behaves across its phases. Defaults to a shorthand like
   * `only` (see {@link StepBehaviorShorthands}), then to `defaults`, the
   * `steps` of the slide, the `defaultProps` of the theme, and finally
   * `'reveal'`.
   */
  behavior?: StepBehavior | undefined;
  /**
   * How the step asks for pages when the slide is split into pages, e.g., for
   * a PDF (see {@link SplitProp}). Its mode defaults to `defaults`, then to
   * the mode of the step it is nested in, and then to the `split` of the
   * slide.
   */
  split?: SplitProp | undefined;
  /**
   * Whether the step may cover other content, which then also needs a page
   * without it when the slide is split into pages. Defaults to `defaults`.
   */
  overlay?: OverlayProp | undefined;
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
 * Creates a stepper with `count` consecutive steps, which takes the same options
 * as `Step`.
 *
 * The stepper is placed among the other steppers according to the position of
 * the elements that the returned `ref` is attached to. Add the returned `className`
 * to them to appear like a `Step`, or pass the behavior `always` for content that
 * stays shown, which the steps nested in it and the pages of the slide rely on.
 *
 * If `with` is a {@link StepHandle}, shares that stepper, and `count` is ignored.
 */
export function useSteps(
  count: number,
  options: UseStepsOptions = {},
): StepHandle {
  const {
    with: withProp,
    id,
    group = id,
    in: parent,
    after,
    title,
    defaults,
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
  const enclosing = use(StepAppearanceContext);
  const withStep = resolveStepperWith(options);
  const { written, appearances, defaultAppearances } =
    resolveStepperAppearances(theme, slideBehavior, options);
  const ignoredBehavior = withStep === 'parent' ? written : undefined;
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
  const handle = typeof withProp === 'object' ? withProp : undefined;
  const { placement, defaultWith, defaultJoins, defaultIn } =
    resolveStepperPlace(options, appearances !== undefined);
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
  const linkedAttach = handle?.attach ?? attach;
  const ref = useCallback<RefCallback<Element>>(
    (element) =>
      element === null
        ? undefined
        : linkedAttach(element, appearances, defaultAppearances),
    [linkedAttach, appearances, defaultAppearances],
  );
  const getStatus =
    handle === undefined ? () => store.getStatus(node) : getUnlinkedStatus;
  const {
    stepIndex,
    phase,
    inherited,
    appearance: stepperAppearance,
  } = useSyncExternalStore(
    handle === undefined ? store.subscribe : subscribeUnlinked,
    getStatus,
    getStatus,
  );
  const clampedIndex = Math.min(stepIndex, count - 1);
  const ownAppearance = resolveElementAppearance(
    phase,
    appearances,
    stepperAppearance,
    defaultAppearances,
    inherited,
    enclosing,
  );
  const ownClassName = appearanceClass(ownAppearance, enclosing);
  const ownStep = useMemo(
    () => ({
      stepper: node,
      ref,
      attach,
      stepCount: count,
      stepIndex: clampedIndex,
      phase,
      isActive: phase !== 'future' && phase !== 'distantFuture',
      isCurrent: phase === 'current' || phase === 'open',
      inherited,
      appearance: ownAppearance,
      className: ownClassName,
      stepperAppearance,
    }),
    [
      node,
      ref,
      attach,
      count,
      clampedIndex,
      phase,
      inherited,
      ownAppearance,
      ownClassName,
      stepperAppearance,
    ],
  );
  const linkedAppearance =
    handle === undefined
      ? undefined
      : resolveElementAppearance(
          handle.phase,
          appearances,
          handle.stepperAppearance,
          defaultAppearances,
          handle.inherited,
          enclosing,
        );
  const linkedStep = useMemo(
    () =>
      handle === undefined || linkedAppearance === undefined
        ? undefined
        : {
            ...handle,
            ref,
            appearance: linkedAppearance,
            className: appearanceClass(linkedAppearance, enclosing),
          },
    [handle, ref, linkedAppearance, enclosing],
  );
  // Editors show where steppers are in the source, and which ones can be read.
  // Only the dev server has a channel to editors.
  const range = getDevChannel() === undefined ? undefined : findSourceRange();
  const { rank } = linkedAppearance ?? ownAppearance;
  const stepper = handle?.stepper ?? node;
  useLayoutEffect(() => {
    if (range === undefined) {
      return undefined;
    }
    store.reportSource(ownNode, { node: stepper, range, rank });
    return () => {
      store.reportSource(ownNode, undefined);
    };
  }, [store, ownNode, stepper, range, rank]);
  return linkedStep ?? ownStep;
}

/** Creates a stepper with a single step. See {@link useSteps}. */
export function useStep(options?: UseStepsOptions): StepHandle {
  return useSteps(1, options);
}
