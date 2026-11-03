import type { StepSource } from './sidebarPage.ts';
import type { SourcePosition } from './slideTable.ts';

/** Where a stepper is, as a probe tells it, without what is visible. */
export type Placed = Omit<StepSource, 'visible'>;

function compare(a: SourcePosition, b: SourcePosition): number {
  return a.line - b.line || a.column - b.column;
}

/**
 * Whether what is at the place of `source` can be read. Of the steppers at the
 * same place, those nested most deeply tell, e.g., rather than the paragraph
 * around a single `:step`, and it can be read if one of them can, e.g., of the
 * steppers in a component.
 */
function isVisible(
  source: StepSource,
  sources: readonly StepSource[],
): boolean {
  const same = sources.filter(
    ({ start, end }) =>
      compare(start, source.start) === 0 && compare(end, source.end) === 0,
  );
  const depth = Math.max(...same.map(({ path }) => path.length));
  return same.some(({ path, visible }) => path.length === depth && visible);
}

/** Whether `position` is in `source`, or right after it. */
function contains(source: Placed, position: SourcePosition): boolean {
  return (
    compare(source.start, position) <= 0 && compare(position, source.end) <= 0
  );
}

/** Returns what of `sources` is in the file `file`, which the deck is if unset. */
export function sourcesIn<T extends Placed>(
  sources: readonly T[],
  file: string,
  deck: string,
): T[] {
  return sources.filter((source) => (source.file ?? deck) === file);
}

/** Returns the steppers around `position`, and the innermost one, if any. */
function around<T extends Placed>(
  sources: readonly T[],
  position: SourcePosition,
): { around: T[]; innermost: T | undefined } {
  const containing = sources.filter((source) => contains(source, position));
  return {
    around: containing,
    innermost: containing.reduce<T | undefined>((best, source) => {
      if (best === undefined) {
        return source;
      }
      const inside =
        compare(source.start, best.start) || compare(best.end, source.end);
      return inside > 0 ||
        (inside === 0 && source.path.length > best.path.length)
        ? source
        : best;
    }, undefined),
  };
}

/**
 * Returns the step to go to for a cursor at `position`, among the steppers of
 * the slide in the file of the cursor, or `undefined` to stay: if the cursor is
 * in no stepper, or in one that can be read now.
 */
export function stepOfCursor(
  sources: readonly StepSource[],
  position: SourcePosition,
): number[] | undefined {
  const { around: containing, innermost } = around(sources, position);
  return innermost === undefined || isVisible(innermost, containing)
    ? undefined
    : innermost.path;
}

/**
 * Returns the step that shows what a cursor at `position` is on, among the
 * steppers of another slide, or `undefined` if the cursor says nothing: if it's
 * in no stepper, or in what the slide always shows.
 */
export function stepOnSlide(
  sources: readonly Placed[],
  position: SourcePosition,
): number[] | undefined {
  const path = around(sources, position).innermost?.path;
  return path === undefined || path.length === 0 ? undefined : path;
}

/** Returns where the first stepper of the step at `current` is, if known. */
export function sourceOfStep(
  sources: readonly StepSource[],
  current: readonly number[],
): StepSource | undefined {
  const step = current.at(-1);
  if (step === undefined) {
    return undefined;
  }
  return sources
    .filter(
      ({ path, last }) =>
        path.length === current.length &&
        path.slice(0, -1).every((part, index) => part === current[index]) &&
        (path.at(-1) ?? 0) <= step &&
        step <= last,
    )
    .sort((a, b) => compare(a.start, b.start))[0];
}

/** Returns the parts of `sources` that can't be read now. */
export function hiddenSources(sources: readonly StepSource[]): StepSource[] {
  return sources.filter((source) => !isVisible(source, sources));
}
