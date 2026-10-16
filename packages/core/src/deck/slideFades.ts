import { isValidElement, type ReactNode } from 'react';

import type {
  SlideMaster,
  SlideMasters,
  SlideTransition,
} from '../masters/SlideMaster.ts';

const SLIDE_TRANSITIONS: ReadonlySet<unknown> = new Set<SlideTransition>([
  'fade',
  'cut',
  'cut-before',
  'cut-after',
  'cut-in',
  'cut-out',
]);

/**
 * Reads the `transition` of a slide or master, e.g., `'cut-in cut-after'`
 * from MDX, or `undefined` if it has none.
 */
export function parseSlideTransition(
  value: unknown,
): ReadonlySet<SlideTransition> | undefined {
  const tokens: unknown[] | undefined =
    typeof value === 'string'
      ? value.trim().split(/\s+/)
      : Array.isArray(value)
        ? value
        : undefined;
  const transitions = tokens?.filter((token): token is SlideTransition =>
    SLIDE_TRANSITIONS.has(token),
  );
  return transitions === undefined || transitions.length === 0
    ? undefined
    : new Set(transitions);
}

const NO_CUTS: ReadonlySet<SlideTransition> = new Set();

/**
 * Returns which fades `slide` cuts: by its own `transition`, or that of its
 * master in `masters`, if it's a `Slide`.
 */
export function getSlideCuts(
  slide: ReactNode,
  masters: SlideMasters,
): ReadonlySet<SlideTransition> {
  if (!isValidElement<{ transition?: unknown; master?: unknown }>(slide)) {
    return NO_CUTS;
  }
  const { transition, master = 'content' } = slide.props;
  const own = parseSlideTransition(transition);
  if (own !== undefined) {
    return own;
  }
  const component =
    typeof master === 'string'
      ? masters[master]
      : (master as SlideMaster | undefined);
  return parseSlideTransition(component?.transition) ?? NO_CUTS;
}

/**
 * Whether going from a slide that cuts `from` to one that cuts `to`, which
 * comes after it in the deck if `forward`, fades, i.e., neither cuts it.
 */
export function fadesBetween(
  from: ReadonlySet<SlideTransition>,
  to: ReadonlySet<SlideTransition>,
  forward: boolean,
): boolean {
  const cuts = (
    slide: ReadonlySet<SlideTransition>,
    ...kinds: SlideTransition[]
  ) => slide.has('cut') || kinds.some((kind) => slide.has(kind));
  return !(
    cuts(from, 'cut-out', forward ? 'cut-after' : 'cut-before') ||
    cuts(to, 'cut-in', forward ? 'cut-before' : 'cut-after')
  );
}
