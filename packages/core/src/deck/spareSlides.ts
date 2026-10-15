/**
 * Navigation between slides that skips spare slides, e.g., backup slides for
 * questions, which are only shown when chosen explicitly, e.g., from the table
 * of contents or the overview. From a spare slide, the adjacent slides are
 * shown, so that a run of spare slides can be gone through.
 *
 * `spares` tells for each slide whether it's spare.
 */

/**
 * Returns the slide after `index`: the next slide that isn't spare, or the
 * next slide if `index` is spare, or `undefined` if there is none.
 */
export function findNextSlide(
  spares: readonly boolean[],
  index: number,
): number | undefined {
  for (let next = index + 1; next < spares.length; next += 1) {
    if (spares[index] === true || spares[next] !== true) {
      return next;
    }
  }
  return undefined;
}

/**
 * Returns the slide before `index`: the previous slide that isn't spare, or
 * the previous slide if `index` is spare, or `undefined` if there is none.
 */
export function findPreviousSlide(
  spares: readonly boolean[],
  index: number,
): number | undefined {
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    if (spares[index] === true || spares[previous] !== true) {
      return previous;
    }
  }
  return undefined;
}

/** Returns the first slide that isn't spare, or the first slide if all are. */
export function findFirstSlide(spares: readonly boolean[]): number {
  const index = spares.indexOf(false);
  return index >= 0 ? index : 0;
}

/** Returns the last slide that isn't spare, or the last slide if all are. */
export function findLastSlide(spares: readonly boolean[]): number {
  const index = spares.lastIndexOf(false);
  return index >= 0 ? index : Math.max(spares.length - 1, 0);
}
