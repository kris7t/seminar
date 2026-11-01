import type { StepBehavior, StepProps } from './Step.tsx';
import type { OverlayProp, SplitProp } from './stepSplit.ts';
import type { StepWith } from './useSteps.ts';

/** A step that a step without a place of its own can be shown with. */
export type StepPlace = 'previous' | 'content' | 'initial';

/** What a step does by default if it is a step, see {@link StepDefaults}. */
export interface StepOwnDefaults {
  /**
   * The behavior unless a behavior or a shorthand is set, which takes precedence
   * over the default of the slide and theme.
   */
  behavior?: StepBehavior | undefined;
  /** What `split` leaves out. */
  split?: SplitProp | undefined;
  /** Whether the step is an overlay unless `overlay` says otherwise. */
  overlay?: OverlayProp | undefined;
}

/**
 * What a `Step` does unless the user says otherwise:
 *
 * - `{ joins: 'content' }` isn't a step: it's part of the step it refers to,
 *   and looks like it, or is shown up front if there is none, e.g., list items.
 *   `with`, `step`, `in`, `after`, a step behavior, e.g., `only`, or a group
 *   with other steps replaces it with a step.
 * - `{ with: 'content' }`, like `with="content"`, is also part of that step, but
 *   creates a step if there is none. `with`, `step`, `in`, or `after` replaces it.
 * - `{ in: group }` nests the step in a group or in the step of an element,
 *   e.g., callouts in the step of the element they point at. `in` or `after`
 *   replaces it.
 *
 * Steps creating a group, e.g., with an `id`, still use their default.
 */
export type StepDefaults =
  | {
      joins: StepPlace;
      with?: never;
      in?: never;
      behavior?: never;
      split?: never;
      overlay?: never;
    }
  | (StepOwnDefaults & {
      joins?: never;
      with?: StepPlace | undefined;
      in?: never;
    })
  | (StepOwnDefaults & {
      joins?: never;
      with?: never;
      in: string | Element;
    });

/**
 * Makes a step part of the content before it by default, rather than a step of
 * its own, or shows it up front if there is none, e.g., for content shown in
 * order with the steps around it, like paragraphs.
 */
export const JOINS_CONTENT: StepDefaults = { joins: 'content' };

/** Where a `Step` goes, and whether it looks like itself, given its props. */
interface ResolvedStepPlace {
  /** What the user chose, which is `undefined` to leave it to the defaults. */
  with: StepWith | undefined;
  defaultWith: StepPlace | undefined;
  defaultIn: string | Element | undefined;
  /** See the `joins` option of `useSteps`. */
  joins: 'target' | 'always' | undefined;
  /** Whether it has a behavior of its own, instead of what's around it. */
  ownLook: boolean;
}

/**
 * Works out where a `Step` goes from the props that say so, where `behavior` is
 * the behavior chosen by the user, if any.
 */
export function resolveStepPlace({
  with: withStep,
  initial,
  step,
  in: parent,
  after,
  behavior,
  defaults,
}: Pick<
  StepProps,
  'with' | 'initial' | 'step' | 'in' | 'after' | 'behavior' | 'defaults'
>): ResolvedStepPlace {
  const explicitWith =
    withStep ??
    (initial === true || initial === ''
      ? 'initial'
      : step === true || step === ''
        ? 'self'
        : step === false || step === 'false'
          ? 'parent'
          : undefined);
  const placed = parent !== undefined || after !== undefined;
  // Placing it otherwise replaces the default of its place.
  const defaultPlace =
    explicitWith === undefined && !placed ? defaults : undefined;
  const defaultWith = defaultPlace?.with;
  const defaultJoins = behavior === undefined ? defaultPlace?.joins : undefined;
  // What isn't a step always looks like what encloses it.
  const ownLook =
    explicitWith !== 'parent' &&
    (behavior !== undefined || defaults?.behavior !== undefined);
  // Without a look of its own, a step is part of the step it's placed with.
  const joinsTarget =
    !ownLook &&
    (defaultWith !== undefined ||
      explicitWith === 'previous' ||
      explicitWith === 'content' ||
      explicitWith === 'initial');
  return {
    with: explicitWith,
    defaultWith: defaultJoins ?? defaultWith,
    defaultIn: placed ? undefined : defaults?.in,
    joins:
      defaultJoins !== undefined
        ? 'always'
        : joinsTarget
          ? 'target'
          : undefined,
    ownLook,
  };
}
