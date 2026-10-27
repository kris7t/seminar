import { generateUtilityClass } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { createContext, use, type Context } from 'react';

import type { StepPhase } from './StepStore.ts';

/**
 * Further appearances of steps. Add them by module augmentation, e.g.,
 * `interface StepAppearanceOverrides { blurred: true }`, give them a rank with
 * `stepAppearances` in the theme, and style them with their
 * `SeminarStep-<name>` class.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface StepAppearanceOverrides {}

/**
 * How a step looks, which its nested steps inherit: they look at least as
 * hidden as the steps they are nested in, as ordered by the ranks of the
 * appearances (see {@link BUILT_IN_APPEARANCE_RANKS}).
 */
export type StepAppearance =
  | 'shown'
  | 'dimmed'
  | 'hidden'
  | 'collapsed'
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof StepAppearanceOverrides;

/**
 * Ranks of the built-in appearances: the higher the rank, the more hidden the
 * appearance. `hidden` keeps the space of the content, while `collapsed`
 * removes it from the layout. Themes can slot their own appearances in
 * between with `stepAppearances`, e.g., `{ blurred: 50 }`.
 */
export const BUILT_IN_APPEARANCE_RANKS: Readonly<
  Record<'shown' | 'dimmed' | 'hidden' | 'collapsed', number>
> = {
  shown: 0,
  dimmed: 100,
  hidden: 200,
  collapsed: 300,
};

/**
 * How a step behavior looks in each {@link StepPhase}. The phases that only
 * nesting brings about fall back to the ones they refine: `'open'` to
 * `'current'`, `'distantFuture'` to `'future'`, and `'distantPast'` to
 * `'past'`, and the rest are shown.
 */
export type StepAppearances = Readonly<
  Partial<Record<StepPhase, StepAppearance>>
>;

/** An appearance with its rank in the theme. */
export interface RankedAppearance {
  readonly name: StepAppearance;
  readonly rank: number;
}

/** How a step behavior looks in every phase, with the ranks. */
export type RankedAppearances = Readonly<Record<StepPhase, RankedAppearance>>;

declare module '@mui/material/styles' {
  interface Theme {
    /**
     * Ranks of further appearances of steps, which may also change the ranks
     * of the built-in ones (see {@link BUILT_IN_APPEARANCE_RANKS}).
     */
    stepAppearances?: Partial<Record<StepAppearance, number>> | undefined;
    /**
     * The most hidden appearance that still shows content when slides are
     * split into pages, e.g., for a PDF. Defaults to `dimmed`, so that dimmed
     * content doesn't need pages of its own.
     */
    legibleStepAppearance?: StepAppearance | undefined;
  }

  interface ThemeOptions {
    stepAppearances?: Partial<Record<StepAppearance, number>> | undefined;
    legibleStepAppearance?: StepAppearance | undefined;
  }
}

export const SHOWN: RankedAppearance = { name: 'shown', rank: 0 };

/** Returns the more hidden of `a` and `b`, or `a` if they are the same. */
export function moreHidden(
  a: RankedAppearance,
  b: RankedAppearance,
): RankedAppearance {
  return a.rank >= b.rank ? a : b;
}

/** Returns the rank of `appearance` in `theme`. */
export function rankOf(theme: Theme, appearance: StepAppearance): number {
  const builtIn: Partial<Record<StepAppearance, number>> =
    BUILT_IN_APPEARANCE_RANKS;
  return theme.stepAppearances?.[appearance] ?? builtIn[appearance] ?? 0;
}

const rankedCache = new WeakMap<
  Theme,
  WeakMap<StepAppearances, RankedAppearances>
>();

/**
 * Adds the ranks in `theme` to `appearances`. The result is stable for the
 * same theme and appearances.
 */
export function rankAppearances(
  theme: Theme,
  appearances: StepAppearances,
): RankedAppearances {
  let byAppearances = rankedCache.get(theme);
  if (byAppearances === undefined) {
    byAppearances = new WeakMap();
    rankedCache.set(theme, byAppearances);
  }
  let ranked = byAppearances.get(appearances);
  if (ranked === undefined) {
    const rank = (name: StepAppearance) => ({
      name,
      rank: rankOf(theme, name),
    });
    const current = appearances.current ?? 'shown';
    const future = appearances.future ?? 'shown';
    const past = appearances.past ?? 'shown';
    ranked = {
      distantFuture: rank(appearances.distantFuture ?? future),
      future: rank(future),
      current: rank(current),
      open: rank(appearances.open ?? current),
      past: rank(past),
      distantPast: rank(appearances.distantPast ?? past),
    };
    byAppearances.set(appearances, ranked);
  }
  return ranked;
}

/** Names of the built-in step behaviors. */
export type BuiltInStepBehavior =
  | 'reveal'
  | 'dim'
  | 'preview'
  | 'focus'
  | 'only'
  | 'scoped'
  | 'insert'
  | 'expand'
  | 'swap';

/**
 * Appearances of the built-in step behaviors (see `StepBehavior`), which
 * themes may extend with `stepBehaviors`.
 */
export const BUILT_IN_STEP_BEHAVIORS: Readonly<
  Record<BuiltInStepBehavior, StepAppearances>
> = {
  reveal: { future: 'hidden' },
  dim: { future: 'hidden', past: 'dimmed' },
  preview: { future: 'dimmed' },
  focus: { future: 'dimmed', past: 'dimmed' },
  only: { future: 'hidden', past: 'hidden' },
  scoped: { future: 'hidden', distantPast: 'hidden' },
  insert: { future: 'collapsed' },
  expand: { future: 'collapsed', distantPast: 'collapsed' },
  swap: { future: 'collapsed', past: 'collapsed' },
};

/** Steps that are always shown, e.g., `Steps`, whose content changes instead. */
export const ALWAYS_SHOWN: RankedAppearances = {
  distantFuture: SHOWN,
  future: SHOWN,
  current: SHOWN,
  open: SHOWN,
  past: SHOWN,
  distantPast: SHOWN,
};

/**
 * Returns the class of the elements of the component `name` with `appearance`,
 * e.g., `SeminarStep-dimmed`, if they have to apply it themselves, i.e., it's
 * more hidden than `enclosing`, which they inherit from the DOM.
 */
export function appearanceClass(
  name: string,
  appearance: RankedAppearance,
  enclosing: RankedAppearance,
): string | undefined {
  return appearance.rank > enclosing.rank
    ? generateUtilityClass(name, appearance.name)
    : undefined;
}

/**
 * How the closest enclosing step element looks, which the elements inside it
 * inherit visually from the DOM, e.g., with `visibility` and `opacity`.
 */
export const StepAppearanceContext: Context<RankedAppearance> =
  createContext<RankedAppearance>(SHOWN);

/**
 * Returns how the closest enclosing step looks, including what it inherits
 * from the steps around it, e.g., to show elements that a component doesn't
 * render inside the step, like the parts of a figure, the same way with the
 * class from {@link appearanceClass}.
 */
export function useStepAppearance(): RankedAppearance {
  return use(StepAppearanceContext);
}
