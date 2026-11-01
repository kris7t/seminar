import { generateUtilityClass, generateUtilityClasses } from '@mui/material';
import type { CSSObject, Theme } from '@mui/material/styles';
import { createContext, use, type Context } from 'react';

import type { StepBehavior } from './Step.tsx';
import type { StepPhase } from './StepNode.ts';

/**
 * Further appearances of steps. Add them by module augmentation, e.g.,
 * `interface StepAppearanceOverrides { blurred: true }`, give them a rank with
 * `stepAppearances` in the theme, and styles with `stepAppearanceStyles`.
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
     * Styles of further appearances of steps, which may also change those of the
     * built-in ones. They apply to anything on a slide with the class from
     * {@link appearanceClass}.
     */
    stepAppearanceStyles?:
      Partial<Record<StepAppearance, CSSObject>> | undefined;
    /**
     * The most hidden appearance that still shows content when slides are
     * split into pages, e.g., for a PDF. Defaults to `dimmed`, so that dimmed
     * content doesn't need pages of its own.
     */
    legibleStepAppearance?: StepAppearance | undefined;
  }

  interface ThemeOptions {
    stepAppearances?: Partial<Record<StepAppearance, number>> | undefined;
    stepAppearanceStyles?:
      Partial<Record<StepAppearance, CSSObject>> | undefined;
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
  | 'swap'
  | 'always';

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
  always: {},
};

/** Whether `appearances` never hide anything, e.g., those of `Steps`. */
export function isAlwaysShown(appearances: RankedAppearances): boolean {
  return Object.values(appearances).every(({ rank }) => rank <= SHOWN.rank);
}

/**
 * Separates the behavior shorthands (see `StepBehaviorShorthands`) from the other
 * `props`, which are passed to the element.
 *
 * @returns The behavior of the shorthand, if any, or of the last one if there
 *   are several, and the other props.
 */
export function splitShorthands<Props extends object>(
  theme: Theme,
  props: Props,
): [behavior: StepBehavior | undefined, other: Props] {
  let behavior: StepBehavior | undefined;
  const other = Object.fromEntries(
    Object.entries(props).filter(([name, value]) => {
      if (
        !Object.hasOwn(BUILT_IN_STEP_BEHAVIORS, name) &&
        !Object.hasOwn(theme.stepBehaviors ?? {}, name)
      ) {
        return true;
      }
      // `false` turns the shorthand off, e.g., `only={false}`.
      if (value === true || value === '') {
        behavior = name as StepBehavior;
      }
      return false;
    }),
  ) as Props;
  return [behavior, other];
}

/** Returns how `behavior` appears in each phase in `theme`. */
export function appearancesOfBehavior(
  theme: Theme,
  behavior: StepBehavior,
): RankedAppearances {
  const builtIn = BUILT_IN_STEP_BEHAVIORS as Partial<
    Record<StepBehavior, StepAppearances>
  >;
  return rankAppearances(
    theme,
    theme.stepBehaviors?.[behavior] ??
      builtIn[behavior] ??
      BUILT_IN_STEP_BEHAVIORS.reveal,
  );
}

/**
 * Returns the class that makes an element on a slide appear as `appearance`, like
 * `SeminarStep-dimmed`, if it has to apply it itself, i.e., it's more hidden than
 * `enclosing`, which it inherits from the DOM.
 */
export function appearanceClass(
  appearance: RankedAppearance,
  enclosing: RankedAppearance,
): string | undefined {
  return appearance.rank > enclosing.rank
    ? generateUtilityClass('SeminarStep', appearance.name)
    : undefined;
}

// Steps change at once: views that show them fade the whole slide instead (see
// `SlideTransitions`), since parents and nested steps fading at the same time
// would show the nested steps through.
const BUILT_IN_APPEARANCE_STYLES: Readonly<
  Record<'hidden' | 'dimmed' | 'collapsed', CSSObject>
> = {
  // Keep the space of hidden content, so that the layout doesn't shift.
  hidden: { visibility: 'hidden', opacity: 0 },
  dimmed: { opacity: 'var(--SeminarStep-dim-opacity, 0.35)' },
  collapsed: { display: 'none' },
};

/**
 * Returns the styles that make the elements inside an element appear as the
 * classes from {@link appearanceClass} say, which every slide applies, so that
 * components only have to add the classes.
 */
export function stepAppearanceStyles(theme: Theme): CSSObject {
  return Object.fromEntries(
    Object.entries({
      ...BUILT_IN_APPEARANCE_STYLES,
      ...theme.stepAppearanceStyles,
    }).map(([name, styles]) => [
      `& .${generateUtilityClass('SeminarStep', name)}`,
      styles,
    ]),
  );
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

/** The classes of a component that follows the steps of its slide. */
export type StepperClassKey = 'root' | StepPhase;

/** Returns the classes of the component `name`, like `SeminarStep`. */
export function stepperClasses(name: string): Record<StepperClassKey, string> {
  return {
    ...generateUtilityClasses(name, [
      'root',
      'distantFuture',
      'future',
      'current',
      'open',
      'past',
      'distantPast',
    ]),
    // MUI would use its global `Mui-open` state class for this.
    open: `${name}-open`,
  };
}
