import type { StepPath } from './StepStore.ts';

/**
 * Restricts the steps that going through a slide shows. Each bound is a step
 * path with dot-separated step numbers, which may start with the name of a
 * step group, e.g., `2`, `1.1`, `parse`, or `parse.1` (see {@link StepPath}).
 *
 * Steps are ordered as going through the slide shows them, e.g., 1, 1.1, 1.9,
 * then 2. A bound without a trailing `.0` stands for the step and the steps
 * nested in it, while a trailing `.0` stands for the step alone, before the
 * steps nested in it, e.g., `after=1` starts at 2, but `after=1.0` at 1.1, and
 * `to=1` ends at 1.9, but `to=1.0` at 1.
 *
 * If no step is in the range, e.g., because it starts after the last step, the
 * last step is shown instead.
 */
export interface StepRange {
  /** The first step to show. */
  from?: string | undefined;
  /** The step after which to start showing steps. */
  after?: string | undefined;
  /** The last step to show. */
  to?: string | undefined;
  /** The step before which to stop showing steps. */
  before?: string | undefined;
  /**
   * Whether to only show the last step of the slide, e.g., for a recap of a
   * slide whose steps have all been shown.
   */
  fromLast?: boolean | undefined;
}

/** A parsed bound of a {@link StepRange}. */
export interface StepBound {
  /** Name of the step group that `path` is relative to, if any. */
  group?: string | undefined;
  path: StepPath;
  /** Whether the bound stands for the steps nested in it, too. */
  nested: boolean;
}

/** The parsed bounds of a {@link StepRange}. */
export type StepBounds = Partial<Record<keyof StepRange, StepBound>>;

const NUMBER_PATTERN = /^\d+$/;

/**
 * Parses a bound of a {@link StepRange}.
 *
 * @returns `undefined` if the bound isn't a step path.
 */
export function parseStepBound(bound: string): StepBound | undefined {
  const [first = '', ...rest] = bound.trim().split('.');
  if (first === '') {
    return undefined;
  }
  const group = NUMBER_PATTERN.test(first) ? undefined : first;
  const segments = group === undefined ? [first, ...rest] : rest;
  if (!segments.every((segment) => NUMBER_PATTERN.test(segment))) {
    return undefined;
  }
  const path = segments.map((segment) => Number.parseInt(segment, 10));
  return { group, path, nested: path.at(-1) !== 0 };
}

/** Parses the bounds of `range`, leaving out invalid ones. */
export function parseStepRange(range: StepRange): StepBounds {
  const bounds: StepBounds = {};
  for (const key of ['from', 'after', 'to', 'before'] as const) {
    const value = range[key];
    const bound = value === undefined ? undefined : parseStepBound(value);
    if (bound !== undefined) {
      bounds[key] = bound;
    }
  }
  return bounds;
}

/**
 * Compares step paths in the order going through a slide shows them, where
 * missing trailing steps are 0.
 */
export function compareStepPaths(a: StepPath, b: StepPath): number {
  for (let depth = 0; depth < Math.max(a.length, b.length); depth += 1) {
    const difference = (a[depth] ?? 0) - (b[depth] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * Compares `path` with a bound at `boundPath`, as if `path` was the step that
 * the steps nested in it belong to if the bound stands for them, too.
 */
function compareWithBound(
  path: StepPath,
  boundPath: StepPath,
  nested: boolean,
): number {
  return compareStepPaths(
    nested ? path.slice(0, boundPath.length) : path,
    boundPath,
  );
}

/**
 * Whether `path` is within the bounds, where `resolve` returns the absolute
 * path of a bound, or `undefined` if it refers to a group that doesn't exist,
 * which doesn't restrict the steps.
 */
export function isInStepRange(
  path: StepPath,
  bounds: StepBounds,
  resolve: (bound: StepBound) => StepPath | undefined,
): boolean {
  const check = (
    bound: StepBound | undefined,
    test: (boundPath: StepPath, nested: boolean) => boolean,
  ) => {
    const boundPath = bound === undefined ? undefined : resolve(bound);
    return (
      bound === undefined ||
      boundPath === undefined ||
      test(boundPath, bound.nested)
    );
  };
  return (
    check(bounds.from, (from) => compareStepPaths(path, from) >= 0) &&
    check(
      bounds.after,
      (after, nested) => compareWithBound(path, after, nested) > 0,
    ) &&
    check(bounds.to, (to, nested) => compareWithBound(path, to, nested) <= 0) &&
    check(bounds.before, (before) => compareStepPaths(path, before) < 0)
  );
}
