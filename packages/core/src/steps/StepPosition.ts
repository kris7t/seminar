import { Listeners } from '../state/Listeners.ts';
import type { StepPath } from './StepStore.ts';

/** The requested position in the steps of a slide. */
export interface StepTarget {
  /**
   * The requested path. Steps that the slide doesn't have are dropped when it
   * is resolved.
   */
  path: StepPath;
  /**
   * Name of a step group whose first step `path` is relative to, e.g., the
   * second step nested in it for the path `[2]`. If the slide has no such
   * group, `fallback` is shown.
   */
  group?: string | undefined;
  /**
   * The path to show instead if the slide has no group `group`, e.g., after
   * the group was renamed. Defaults to the beginning of the slide.
   */
  fallback?: StepPath | undefined;
  /**
   * The texts shown by the step at `path`, or at `fallback` with a group, to
   * find the step by if steps were added or removed before it, e.g., when the
   * slide is edited (see `StepStore`).
   */
  texts?: readonly string[] | undefined;
  /** Whether to also show all steps nested in `path`. */
  toEnd: boolean;
  /**
   * Whether to show the closest step in the range of steps of the slide
   * instead, if the step isn't in it (see `StepRange`), e.g., when entering
   * the slide.
   */
  inRange?: boolean | undefined;
}

/**
 * Holds the position in the steps of a slide, which may be shared by several
 * views of the slide, e.g., by the slide shown to the audience and a preview
 * of it, so that they show the same step.
 */
export interface StepPosition {
  get(): StepTarget;
  set(target: StepTarget): void;
  subscribe(listener: () => void): () => void;
}

export const INITIAL_STEP_TARGET: StepTarget = {
  path: [],
  toEnd: false,
  inRange: true,
};

/** Creates a {@link StepPosition} that only a single view uses. */
export function createStepPosition(
  initial: StepTarget = INITIAL_STEP_TARGET,
): StepPosition {
  let target = initial;
  const listeners = new Listeners();
  return {
    get: () => target,
    set(newTarget) {
      target = newTarget;
      listeners.notify();
    },
    subscribe: listeners.subscribe,
  };
}
