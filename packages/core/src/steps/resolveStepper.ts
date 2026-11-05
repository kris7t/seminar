import type { Theme } from '@mui/material/styles';

import {
  appearancesOfBehavior,
  moreHidden,
  splitShorthands,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import type { StepOptions, StepPhase, StepPlacement } from './StepNode.ts';
import type { StepBehavior } from './Step.tsx';
import { parseOverlay, resolveStepSplit } from './stepSplit.ts';
import type { FadeValues } from '../transitions/fades.ts';
import type { StepWith, UseStepsOptions } from './useSteps.ts';

/** Returns what `with`, `initial`, and `step` say about where a stepper goes. */
export function resolveStepperWith({
  with: withStep,
  initial,
  step,
}: UseStepsOptions): StepWith | undefined {
  return (
    withStep ??
    (initial === true
      ? 'initial'
      : step === true
        ? 'self'
        : step === false
          ? 'parent'
          : undefined)
  );
}

/** How a stepper appears according to its props. */
interface ResolvedStepperAppearances {
  /** The behavior written on it, if any, whether it applies or not. */
  written: StepBehavior | undefined;
  /** How it appears in each phase, if it has appearances of its own. */
  appearances: RankedAppearances | undefined;
  /** How it appears in each phase if there is nothing else to follow. */
  defaultAppearances: RankedAppearances;
}

/**
 * Works out how a stepper appears from its props, the theme, and the `steps` of
 * the slide.
 */
export function resolveStepperAppearances(
  theme: Theme,
  slideBehavior: StepBehavior | undefined,
  props: UseStepsOptions,
): ResolvedStepperAppearances {
  const written = props.behavior ?? splitShorthands(theme, props)[0];
  const chosen = written ?? props.defaults?.behavior;
  return {
    written,
    // What isn't a step always appears like what encloses it.
    appearances:
      chosen === undefined || resolveStepperWith(props) === 'parent'
        ? undefined
        : appearancesOfBehavior(theme, chosen),
    // The behavior of the slide takes precedence over the default of the theme.
    defaultAppearances: appearancesOfBehavior(
      theme,
      slideBehavior ??
        theme.components?.SeminarStep?.defaultProps?.behavior ??
        'reveal',
    ),
  };
}

/** Where a stepper goes according to its props, see {@link StepOptions}. */
interface ResolvedStepperPlace {
  placement: StepPlacement;
  defaultWith: 'previous' | 'content' | 'initial' | undefined;
  defaultJoins: 'previous' | 'content' | 'initial' | undefined;
  defaultIn: string | Element | undefined;
}

/**
 * Works out where a stepper goes from its props, given whether it has appearances
 * of its own.
 */
export function resolveStepperPlace(
  props: UseStepsOptions,
  hasAppearances: boolean,
): ResolvedStepperPlace {
  const withStep = resolveStepperWith(props);
  const { in: parent, after, defaults } = props;
  const placed = parent !== undefined || after !== undefined;
  // Placing it otherwise replaces the default of its place.
  const defaultPlace = withStep === undefined && !placed ? defaults : undefined;
  return {
    placement:
      typeof withStep === 'object' || withStep === 'self'
        ? 'next'
        : (withStep ?? 'next'),
    defaultWith: defaultPlace?.with,
    // A behavior gives it a step instead of always being shown with one.
    defaultJoins: hasAppearances ? undefined : defaultPlace?.joins,
    defaultIn: placed ? undefined : defaults?.in,
  };
}

/**
 * Returns how an element of a stepper appears: by its own appearances, or else
 * like the stepper, at least as hidden as what it inherits and what's around it.
 */
export function resolveElementAppearance(
  phase: StepPhase,
  appearances: RankedAppearances | undefined,
  stepperAppearance: RankedAppearance | undefined,
  defaultAppearances: RankedAppearances,
  inherited: RankedAppearance,
  enclosing: RankedAppearance,
): RankedAppearance {
  return moreHidden(
    moreHidden(
      appearances?.[phase] ?? stepperAppearance ?? defaultAppearances[phase],
      inherited,
    ),
    enclosing,
  );
}

/**
 * Returns what an element with `props` registers in a `StepStore`, like the hooks,
 * which keep the parts of it stable between renders.
 */
export function resolveStepOptions(
  count: number,
  theme: Theme,
  slideBehavior: StepBehavior | undefined,
  props: UseStepsOptions,
): StepOptions {
  const { appearances, defaultAppearances } = resolveStepperAppearances(
    theme,
    slideBehavior,
    props,
  );
  const { placement, defaultWith, defaultJoins, defaultIn } =
    resolveStepperPlace(props, appearances !== undefined);
  const { cut, fade, fadeIn, fadeOut, fadeBefore, fadeAfter } = props;
  const fades: FadeValues = {
    cut: Array.isArray(cut) ? cut.join(' ') : cut,
    fade,
    fadeIn,
    fadeOut,
    fadeBefore,
    fadeAfter,
  };
  return {
    count,
    placement,
    defaults: { with: defaultWith, joins: defaultJoins, in: defaultIn },
    parent: props.in,
    after: props.after,
    title: props.title,
    appearances,
    defaultAppearances,
    fades: Object.values(fades).every((value) => value === undefined)
      ? undefined
      : fades,
    split: resolveStepSplit(props.split, props.defaults?.split),
    overlay:
      parseOverlay(props.overlay) ?? parseOverlay(props.defaults?.overlay),
  };
}
