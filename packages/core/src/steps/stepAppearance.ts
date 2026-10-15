import { generateUtilityClass } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { createContext, type Context } from 'react';

import type { StepPhase } from './StepStore.ts';

/**
 * Further appearances of steps. Add them by module augmentation, e.g.,
 * `interface StepAppearanceOverrides { blurred: true }`, give them a rank with
 * `stepAppearances` in the theme, and style them with their
 * `SliderStep-<name>` class.
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
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof StepAppearanceOverrides;

/**
 * Ranks of the built-in appearances: the higher the rank, the more hidden the
 * appearance. Themes can slot their own appearances in between with
 * `stepAppearances`, e.g., `{ blurred: 50 }`.
 */
export const BUILT_IN_APPEARANCE_RANKS: Readonly<
  Record<'shown' | 'dimmed' | 'hidden', number>
> = {
  shown: 0,
  dimmed: 100,
  hidden: 200,
};

/** How a variant of steps looks in each {@link StepPhase}. */
export type StepAppearances = Readonly<Record<StepPhase, StepAppearance>>;

/** An appearance with its rank in the theme. */
export interface RankedAppearance {
  readonly name: StepAppearance;
  readonly rank: number;
}

/** How a variant of steps looks in each phase, with the ranks. */
export type RankedAppearances = Readonly<Record<StepPhase, RankedAppearance>>;

declare module '@mui/material/styles' {
  interface Theme {
    /**
     * Ranks of further appearances of steps, which may also change the ranks
     * of the built-in ones (see {@link BUILT_IN_APPEARANCE_RANKS}).
     */
    stepAppearances?: Partial<Record<StepAppearance, number>> | undefined;
  }

  interface ThemeOptions {
    stepAppearances?: Partial<Record<StepAppearance, number>> | undefined;
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
    ranked = {
      future: rank(appearances.future),
      current: rank(appearances.current),
      parent: rank(appearances.parent),
      past: rank(appearances.past),
    };
    byAppearances.set(appearances, ranked);
  }
  return ranked;
}

/** Names of the built-in variants of steps. */
export type BuiltInStepVariant =
  'reveal' | 'dim' | 'preview' | 'focus' | 'only';

/**
 * Appearances of the built-in variants of steps (see `StepVariant`), which
 * themes may extend with `stepVariants`.
 */
export const BUILT_IN_STEP_VARIANTS: Readonly<
  Record<BuiltInStepVariant, StepAppearances>
> = {
  reveal: {
    future: 'hidden',
    current: 'shown',
    parent: 'shown',
    past: 'shown',
  },
  dim: { future: 'hidden', current: 'shown', parent: 'shown', past: 'dimmed' },
  preview: {
    future: 'dimmed',
    current: 'shown',
    parent: 'shown',
    past: 'shown',
  },
  focus: {
    future: 'dimmed',
    current: 'shown',
    parent: 'shown',
    past: 'dimmed',
  },
  only: { future: 'hidden', current: 'shown', parent: 'shown', past: 'hidden' },
};

/** Steps that are always shown, e.g., `Steps`, whose content changes instead. */
export const ALWAYS_SHOWN: RankedAppearances = {
  future: SHOWN,
  current: SHOWN,
  parent: SHOWN,
  past: SHOWN,
};

/**
 * Returns the class of the elements of the component `name` with `appearance`,
 * e.g., `SliderStep-dimmed`, if they have to apply it themselves, i.e., it's
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
