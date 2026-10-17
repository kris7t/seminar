/**
 * A side of a slide or step that a change of slides or steps crosses,
 * whichever way the deck goes:
 *
 * - `'before'` and `'after'`: with the slide or step before or after it,
 *   e.g., whose content doesn't fade well into it.
 * - `'in'` and `'out'`: into or out of it, from or to either side.
 *
 * Going from one slide or step to another, e.g., a later one, leaves the
 * first one after it, and enters the other one before it. A cut of a side is
 * a fade of no time on that side, e.g., `cut=in` is `fadeIn=0`.
 */
export type FadeSide = 'before' | 'after' | 'in' | 'out';

/**
 * Which fades of a slide or step to cut: all of them with `true`, or the
 * empty string of a bare `cut` in MDX, e.g., for a slide with a background of
 * its own, none with `false`, or some sides (see {@link FadeSide}), e.g.,
 * `'in'`, `['in', 'after']`, or `'in after'` in an attribute of MDX.
 */
export type CutProp =
  boolean | '' | FadeSide | readonly FadeSide[] | `${FadeSide} ${string}`;

/**
 * Props that set how long the fades of a slide or step take, in
 * milliseconds, e.g., `300`, or `'300'` from MDX.
 */
export interface FadeProps {
  /** Which fades to cut, i.e., to take no time (see {@link CutProp}). */
  cut?: CutProp | undefined;
  /** Duration of the fades on all sides. */
  fade?: number | string | undefined;
  /** Duration of the fades into it. */
  fadeIn?: number | string | undefined;
  /** Duration of the fades out of it. */
  fadeOut?: number | string | undefined;
  /** Duration of the fades with the one before it. */
  fadeBefore?: number | string | undefined;
  /** Duration of the fades with the one after it. */
  fadeAfter?: number | string | undefined;
}

/** Values of {@link FadeProps}, e.g., from MDX, which are checked when read. */
export type FadeValues = Partial<Record<keyof FadeProps, unknown>>;

/** The sides that cut, where `'all'` stands for all of them. */
export type Cuts = ReadonlySet<FadeSide | 'all'>;

const SIDES: ReadonlySet<unknown> = new Set<FadeSide>([
  'before',
  'after',
  'in',
  'out',
]);

export const NO_CUTS: Cuts = new Set();

const ALL_CUTS: Cuts = new Set(['all']);

/**
 * Reads a `cut`, e.g., `'in after'` from MDX, or `undefined` if there is
 * none.
 */
export function parseCuts(value: unknown): Cuts | undefined {
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
    : new Set(tokens.filter((token): token is FadeSide => SIDES.has(token)));
}

/** Names of the props that set the duration of the fades on each side. */
const SIDE_FADES = {
  in: 'fadeIn',
  out: 'fadeOut',
  before: 'fadeBefore',
  after: 'fadeAfter',
} as const satisfies Record<FadeSide, keyof FadeProps>;

/** Reads a duration in milliseconds, e.g., `'300'` from MDX. */
export function parseDuration(value: unknown): number | undefined {
  const duration =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

/**
 * The sides of a slide or step that a change crosses: leaving it, or
 * entering it, going to a later one if `forward`.
 */
export function sidesOf(leaving: boolean, forward: boolean): FadeSide[] {
  return leaving
    ? ['out', forward ? 'after' : 'before']
    : ['in', forward ? 'before' : 'after'];
}

/**
 * A duration of fades in milliseconds that applies to a change, and how
 * explicitly it's set: the higher the rank, the more explicit.
 */
export interface Fade {
  duration: number;
  rank: number;
}

/**
 * Returns the fades that `props` set for `sides`: those of the sides with
 * `rank + 1`, and `fade` with `rank`. Cuts are fades of no time on their
 * sides, and `cuts` replaces the `cut` of `props`, if given.
 */
export function fadesOf(
  props: FadeValues,
  sides: readonly FadeSide[],
  rank: number,
  cuts: Cuts = parseCuts(props.cut) ?? NO_CUTS,
): Fade[] {
  return [
    ...sides.map((side) => ({
      duration:
        cuts.has('all') || cuts.has(side)
          ? 0
          : parseDuration(props[SIDE_FADES[side]]),
      rank: rank + 1,
    })),
    { duration: parseDuration(props.fade), rank },
  ].flatMap(({ duration, rank: fadeRank }) =>
    duration === undefined ? [] : [{ duration, rank: fadeRank }],
  );
}

/**
 * Returns the most explicit of `fades`, or the shortest of the most explicit
 * ones, or `undefined` if there are none.
 */
export function pickFade(fades: readonly Fade[]): number | undefined {
  const rank = Math.max(...fades.map((fade) => fade.rank));
  const durations = fades
    .filter((fade) => fade.rank === rank)
    .map((fade) => fade.duration);
  return durations.length === 0 ? undefined : Math.min(...durations);
}
