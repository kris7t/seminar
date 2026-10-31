import type { RankedAppearances } from './stepAppearance.ts';
import type { StepSplit } from './stepSplit.ts';
import type { FadeValues } from '../transitions/fades.ts';

/**
 * Position of a slide in its steps.
 *
 * Each entry is the number of the current step at a level of the step
 * hierarchy. The first entry refers to the top-level steps of the slide, and
 * each further entry refers to the steps nested inside the current step of the
 * previous level. Steps are numbered from 1, while step 0 of a level consists
 * of the content shown as soon as the level is shown (see `with="initial"`).
 * Missing trailing entries are 0, so the empty path is the state before any
 * step is shown.
 */
export type StepPath = readonly number[];

/**
 * Where the presentation is relative to a stepper:
 *
 * - `'distantFuture'`: like `'future'`, but the step the stepper is nested in
 *   in the tree of steps, or one enclosing that, isn't shown yet either.
 * - `'future'`: the stepper isn't shown yet.
 * - `'current'`: the current step of the slide is one of the steps of the
 *   stepper.
 * - `'open'`: like `'current'`, but a step nested inside the stepper has been
 *   shown since, which is the current step of the slide or encloses it.
 * - `'past'`: a later step on the same level has been shown.
 * - `'distantPast'`: like `'past'`, but the step the stepper is nested in, or
 *   one enclosing that, is past, too.
 *
 * Steppers that aren't nested in any step are never in the distant phases.
 */
export type StepPhase =
  'distantFuture' | 'future' | 'current' | 'open' | 'past' | 'distantPast';

/**
 * Where the first step of a stepper is placed on its level:
 *
 * - `'next'`: after the previous step.
 * - `'previous'`: together with the previous stepper on the same level (in
 *   document order), or like `'initial'` if there is none.
 * - `'content'`: like `'previous'`, but skipping the steppers that are overlays.
 * - `'initial'`: at step 0, i.e., shown as soon as the level is shown.
 * - `'parent'`: like `'initial'`, but as part of what encloses the stepper. The
 *   steppers placed with `'previous'` or `'content'` after it are, too.
 */
export type StepPlacement =
  'next' | 'previous' | 'content' | 'initial' | 'parent';

export interface StepOptions {
  /** Number of consecutive steps taken by the stepper. */
  count: number;
  placement: StepPlacement;
  /**
   * Placement instead of `placement` if the stepper has no other elements,
   * i.e., it doesn't join an existing group.
   */
  defaultPlacement?: StepPlacement | undefined;
  /**
   * Whether the stepper has no look of its own, and thus is part of the step
   * its placement refers to, if any, rather than a step, unless it has other
   * elements.
   */
  joins?: boolean | undefined;
  /** Whether the stepper with `joins` isn't a step without a step to join. */
  stepless?: boolean | undefined;
  /**
   * Group of the stepper to nest the stepper in, instead of the stepper
   * enclosing its elements, or an element whose stepper, or the stepper
   * enclosing it, to nest the stepper in.
   */
  parent?: string | Element | undefined;
  /**
   * Like `parent`, but only if the stepper has no other elements, i.e., it
   * doesn't join an existing group.
   */
  defaultParent?: string | Element | undefined;
  /**
   * Group of the stepper to place the stepper right after, on the level of
   * that stepper, i.e., nested in the same stepper. Takes precedence over
   * `parent` and the steppers enclosing the elements of the stepper.
   */
  after?: string | undefined;
  /** Title of the stepper in the tree of steps, instead of its text. */
  title?: string | undefined;
  /** How the stepper looks in each phase. Shown in all phases by default. */
  appearances?: RankedAppearances | undefined;
  /**
   * Whether `appearances` were chosen for this element, rather than being what
   * the stepper looks like if there is nothing else to look like.
   */
  ownLook?: boolean | undefined;
  /**
   * How long the slide fades when the turn of the stepper starts or ends,
   * which applies along with those of the other elements of the stepper.
   */
  fades?: FadeValues | undefined;
  /**
   * How the stepper asks for pages when the slide is split into pages, where
   * a missing mode is taken from the stepper it is nested in.
   */
  split?: StepSplit | undefined;
  /**
   * Whether the stepper may cover other content, which then also needs a page
   * without it when the slide is split into pages, e.g., callouts.
   */
  overlay?: boolean | undefined;
}

/** A stepper registered in a `StepStore`. */
export class StepNode {
  /**
   * The elements of the stepper with their options. The options of the first
   * element in document order apply to the stepper.
   */
  readonly elements: Map<Element, StepOptions> = new Map<
    Element,
    StepOptions
  >();
}
