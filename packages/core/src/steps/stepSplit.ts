import { parseStepBound, type StepBound } from './stepRange.ts';

/**
 * How the content of a step asks for pages when a slide is split into pages,
 * e.g., for a PDF:
 *
 * - `'auto'`: some page shows the content, at its most visible.
 * - `'none'`: the content doesn't need a page, but pages chosen for other
 *   reasons may still show it.
 * - `'each'`: some page shows the content in each step of the stepper, e.g.,
 *   for `Steps`, whose content may change in each of its steps.
 *
 * Steps nested in a step take its mode, unless they set their own.
 */
export type SplitMode = 'auto' | 'none' | 'each';

/**
 * A state of a step that is always a page when its slide is split into pages:
 *
 * - `'before'`: just before its turn starts, e.g., if it covers other content.
 * - `'initial'`: when it's shown, before the steps nested in it.
 * - `'last'`: at the end of its turn, after the steps nested in it.
 */
export type SplitPoint = 'before' | 'initial' | 'last';

export type SplitWord = SplitMode | SplitPoint;

/**
 * How a step asks for pages when its slide is split into pages: a
 * {@link SplitMode}, any of the {@link SplitPoint}s, or both, e.g., `'none'`,
 * `['before', 'last']`, or `'none initial'` in an attribute of MDX. `true` and
 * the empty string of a bare `split` in MDX stand for `'initial'`, and `false`
 * for `'none'` without points.
 */
export type SplitProp =
  boolean | '' | SplitWord | readonly SplitWord[] | `${SplitWord} ${string}`;

/** A parsed {@link SplitProp}, where missing parts are left to defaults. */
export interface StepSplit {
  mode?: SplitMode | undefined;
  points?: ReadonlySet<SplitPoint> | undefined;
}

const MODES: ReadonlySet<unknown> = new Set<SplitMode>([
  'auto',
  'none',
  'each',
]);

const POINTS: ReadonlySet<unknown> = new Set<SplitPoint>([
  'before',
  'initial',
  'last',
]);

const NO_POINTS: ReadonlySet<SplitPoint> = new Set();

const INITIAL: StepSplit = { points: new Set(['initial']) };

const NONE: StepSplit = { mode: 'none', points: NO_POINTS };

function tokensOf(value: unknown): unknown[] | undefined {
  return typeof value === 'string'
    ? value.trim().split(/\s+/)
    : Array.isArray(value)
      ? value
      : undefined;
}

/**
 * Reads a {@link SplitProp}, e.g., `'before last'` from MDX, or `undefined`
 * if there is none. Unknown words are left out, and the last mode counts.
 */
export function parseStepSplit(value: unknown): StepSplit | undefined {
  if (value === true || value === '' || value === 'true') {
    return INITIAL;
  }
  if (value === false || value === 'false') {
    return NONE;
  }
  const tokens = tokensOf(value);
  if (tokens === undefined) {
    return undefined;
  }
  let mode: SplitMode | undefined;
  const points = new Set<SplitPoint>();
  for (const token of tokens) {
    if (MODES.has(token)) {
      mode = token as SplitMode;
    } else if (POINTS.has(token)) {
      points.add(token as SplitPoint);
    }
  }
  return { mode, points: points.size === 0 ? undefined : points };
}

/**
 * Reads the `split` of a step, and fills in what it leaves out from
 * `defaultSplit`, e.g., of a component.
 */
export function resolveStepSplit(
  split: unknown,
  defaultSplit: unknown,
): StepSplit | undefined {
  const own = parseStepSplit(split);
  const fallback = parseStepSplit(defaultSplit);
  if (own === undefined || fallback === undefined) {
    return own ?? fallback;
  }
  return {
    mode: own.mode ?? fallback.mode,
    points: own.points ?? fallback.points,
  };
}

/**
 * How a slide is split into pages: the {@link SplitMode} of its steps that
 * don't set their own, e.g., `'none'` for a single page, or a list of the
 * steps to make pages of, like the bounds of a `StepRange`, e.g., `'1, parse'`,
 * which also sets the mode of the steps to `'none'` unless it has a mode,
 * too. The last step of the slide is always a page.
 */
export type SlideSplitProp = boolean | SplitMode | (string & {});

/** A parsed {@link SlideSplitProp}. */
export interface SlideSplit {
  mode?: SplitMode | undefined;
  pages: readonly StepBound[];
}

/**
 * Reads the `split` of a slide, or `undefined` if there is none. Words that
 * are neither modes nor steps are left out.
 */
export function parseSlideSplit(value: unknown): SlideSplit | undefined {
  if (value === false || value === 'false') {
    return { mode: 'none', pages: [] };
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  let mode: SplitMode | undefined;
  const pages: StepBound[] = [];
  for (const token of value.split(/[\s,]+/)) {
    if (MODES.has(token)) {
      mode = token as SplitMode;
    } else {
      const bound = parseStepBound(token);
      if (bound !== undefined) {
        pages.push(bound);
      }
    }
  }
  return { mode: mode ?? (pages.length > 0 ? 'none' : undefined), pages };
}

/**
 * Chooses the states of a slide to make pages of: the forced ones, the last
 * one, and as few others as possible so that each unit, e.g., the content of
 * a step, is on some page among the states admissible for it. Going through
 * the states in order, a state is chosen if some unit that isn't on a page
 * yet won't be admissible in the next state, i.e., right before it's hidden
 * or covered, which chooses the fewest states if the admissible states of
 * each unit follow each other.
 *
 * @param count Number of states.
 * @param units The indices of the states admissible for each unit. Units
 *   without admissible states are left out.
 * @param forced Indices of the states that must be pages.
 * @returns The indices of the chosen states in order.
 */
export function planSplit(
  count: number,
  units: readonly ReadonlySet<number>[],
  forced: Iterable<number>,
): number[] {
  if (count === 0) {
    return [];
  }
  const chosen = new Set<number>();
  let pending = units.filter((unit) => unit.size > 0);
  const choose = (state: number) => {
    chosen.add(state);
    pending = pending.filter((unit) => !unit.has(state));
  };
  for (const state of forced) {
    if (Number.isInteger(state) && state >= 0 && state < count) {
      choose(state);
    }
  }
  choose(count - 1);
  for (let state = 0; state < count - 1; state += 1) {
    if (pending.some((unit) => unit.has(state) && !unit.has(state + 1))) {
      choose(state);
    }
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Whether a step may cover other content (see the `overlay` option of
 * `useSteps`): `true`, or the empty string of a bare `overlay` in MDX, or
 * `false`, also as the strings `'true'` and `'false'` from MDX.
 */
export type OverlayProp = boolean | '' | 'true' | 'false';

/** Reads an {@link OverlayProp}, or `undefined` if there is none. */
export function parseOverlay(value: unknown): boolean | undefined {
  if (value === true || value === '' || value === 'true') {
    return true;
  }
  return value === false || value === 'false' ? false : undefined;
}
