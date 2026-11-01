import type { RankedAppearances } from './stepAppearance.ts';
import type { StepPlace } from './stepDefaults.ts';
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
 * - `'parent'`: part of what encloses the stepper, rather than a step, so what
 *   comes after it has nothing to be placed with.
 */
export type StepPlacement =
  'next' | 'previous' | 'content' | 'initial' | 'parent';

export interface StepOptions {
  /** Number of consecutive steps taken by the stepper. */
  count: number;
  placement: StepPlacement;
  /**
   * Group of the stepper to nest the stepper in, instead of the stepper
   * enclosing its elements, or an element whose stepper, or the stepper
   * enclosing it, to nest the stepper in.
   */
  parent?: string | Element | undefined;
  /**
   * Where the stepper goes if it has no other elements, i.e., it doesn't join an
   * existing group, instead of `placement` and `parent`: `with` shows it with a
   * step, creating one if there is none, while `joins` never creates a step.
   */
  defaults?:
    | {
        with?: StepPlace | undefined;
        joins?: StepPlace | undefined;
        in?: string | Element | undefined;
      }
    | undefined;
  /**
   * Group of the stepper to place the stepper right after, on the level of
   * that stepper, i.e., nested in the same stepper. Takes precedence over
   * `parent` and the steppers enclosing the elements of the stepper.
   */
  after?: string | undefined;
  /** Title of the stepper in the tree of steps, instead of its text. */
  title?: string | undefined;
  /**
   * How the element appears in each phase, whatever the stepper does, if it has
   * an appearance of its own. The first element also sets the appearances of
   * the stepper.
   */
  appearances?: RankedAppearances | undefined;
  /** Like `appearances`, but only if the element has none of its own. */
  defaultAppearances?: RankedAppearances | undefined;
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
