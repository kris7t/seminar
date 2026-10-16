import { isValidElement, type ReactNode } from 'react';

import type {
  SlideCut,
  SlideMaster,
  SlideMasters,
} from '../masters/SlideMaster.ts';

/** The sides of a slide that cut, where `'all'` stands for all of them. */
type SlideCuts = ReadonlySet<SlideCut | 'all'>;

const SLIDE_CUTS: ReadonlySet<unknown> = new Set<SlideCut>([
  'before',
  'after',
  'in',
  'out',
]);

const NO_CUTS: SlideCuts = new Set();

const ALL_CUTS: SlideCuts = new Set(['all']);

/**
 * Reads the `cut` of a slide or master, e.g., `'in after'` from MDX, or
 * `undefined` if it has none.
 */
export function parseSlideCuts(value: unknown): SlideCuts | undefined {
  if (value === true || value === '' || value === 'true') {
    return ALL_CUTS;
  }
  if (value === false || value === 'false') {
    return NO_CUTS;
  }
  const tokens: unknown[] | undefined =
    typeof value === 'string'
      ? value.trim().split(/\s+/)
      : Array.isArray(value)
        ? value
        : undefined;
  return tokens === undefined
    ? undefined
    : new Set(
        tokens.filter((token): token is SlideCut => SLIDE_CUTS.has(token)),
      );
}

/** Names of the props that set the duration of the fades on each side. */
const SIDE_FADES = {
  in: 'fadeIn',
  out: 'fadeOut',
  before: 'fadeBefore',
  after: 'fadeAfter',
} as const satisfies Record<SlideCut, string>;

/** The props that set the fades of a slide or master. */
type FadeSource = Partial<
  Record<'cut' | 'fade' | (typeof SIDE_FADES)[SlideCut], unknown>
>;

/** The props of `slide` and its master in `masters`, if it's a `Slide`. */
function propsOf(
  slide: ReactNode,
  masters: SlideMasters,
): {
  props: FadeSource;
  master: FadeSource | undefined;
} {
  if (!isValidElement<FadeSource & { master?: unknown }>(slide)) {
    return { props: {}, master: undefined };
  }
  const { master = 'content' } = slide.props;
  return {
    props: slide.props,
    master:
      typeof master === 'string'
        ? masters[master]
        : (master as SlideMaster | undefined),
  };
}

/**
 * The sides of a slide that a change of slides crosses: leaving it, or
 * entering it, going to a later slide if `forward`.
 */
function sidesOf(leaving: boolean, forward: boolean): SlideCut[] {
  return leaving
    ? ['out', forward ? 'after' : 'before']
    : ['in', forward ? 'before' : 'after'];
}

function parseDuration(value: unknown): number | undefined {
  const duration =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

/**
 * A duration of fades in milliseconds that applies to a change, and how
 * explicitly: from a side-specific `fadeIn`, `fadeOut`, `fadeBefore`, or
 * `fadeAfter` of a slide, its `fade`, or those of its master, in this order.
 */
interface Fade {
  duration: number;
  rank: number;
}

/** Returns the fades that `slide` sets for its `sides`, if any. */
function fadesOf(
  slide: ReactNode,
  masters: SlideMasters,
  sides: readonly SlideCut[],
): Fade[] {
  const { props, master } = propsOf(slide, masters);
  return [
    { source: props, rank: 2 },
    { source: master ?? {}, rank: 0 },
  ].flatMap(({ source, rank }) => {
    // Cuts are fades of no time on their sides, e.g., `cut=in` is
    // `fadeIn=0`, and `cut` is 0 on all sides.
    // The `cut` of the slide replaces that of its master, e.g., `cut=false`.
    const cuts =
      source === master && parseSlideCuts(props.cut) !== undefined
        ? NO_CUTS
        : (parseSlideCuts(source.cut) ?? NO_CUTS);
    return [
      ...sides.map((side) => ({
        duration:
          cuts.has('all') || cuts.has(side)
            ? 0
            : parseDuration(source[SIDE_FADES[side]]),
        rank: rank + 1,
      })),
      { duration: parseDuration(source.fade), rank },
    ].flatMap(({ duration, rank: fadeRank }) =>
      duration === undefined ? [] : [{ duration, rank: fadeRank }],
    );
  });
}

/**
 * Returns the most explicit of `fades`, or the shortest of the most explicit
 * ones, or `undefined` if there are none.
 */
function pickFade(fades: readonly Fade[]): number | undefined {
  const rank = Math.max(...fades.map((fade) => fade.rank));
  const durations = fades
    .filter((fade) => fade.rank === rank)
    .map((fade) => fade.duration);
  return durations.length === 0 ? undefined : Math.min(...durations);
}

/**
 * Returns how long `slide` fades from one step to another: its `fade`, or
 * that of its master, or `undefined` for that of the theme.
 */
export function getStepFade(
  slide: ReactNode,
  masters: SlideMasters,
): number | undefined {
  return pickFade(fadesOf(slide, masters, []));
}

/**
 * Returns how long the slide `from` fades into the slide `to`, which comes
 * after it in the deck if `forward`: the most explicit of the fades that
 * either of them sets for the sides crossed, or the shortest of those, or
 * `undefined` for that of the theme. 0 cuts.
 */
export function getFadeBetween(
  from: ReactNode,
  to: ReactNode,
  forward: boolean,
  masters: SlideMasters,
): number | undefined {
  return pickFade([
    ...fadesOf(from, masters, sidesOf(true, forward)),
    ...fadesOf(to, masters, sidesOf(false, forward)),
  ]);
}
