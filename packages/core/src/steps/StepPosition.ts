import type { StepPath } from './StepStore.ts';

/** The requested position in the steps of a slide. */
export interface StepTarget {
  /**
   * The requested path. Steps that the slide doesn't have are dropped when it
   * is resolved.
   */
  path: StepPath;
  /** Whether to also show all steps nested in `path`. */
  toEnd: boolean;
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

export const INITIAL_STEP_TARGET: StepTarget = { path: [], toEnd: false };

/** Creates a {@link StepPosition} that only a single view uses. */
export function createStepPosition(
  initial: StepTarget = INITIAL_STEP_TARGET,
): StepPosition {
  let target = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => target,
    set(newTarget) {
      target = newTarget;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
