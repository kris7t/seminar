/**
 * Finds where each of the `previous` slides went in the `next` slides of a
 * deck, e.g., after the deck was edited during development.
 *
 * Slides with an id that the next slides still have keep it. The other slides
 * keep their offset from the closest such slide before them, as long as they
 * stay before the next such slide, so that a slide whose id changed with its
 * title is still found, even if slides were added or removed elsewhere.
 *
 * @param previous The ids of the previous slides, or `undefined` for slides
 *   without one.
 * @param next The ids of the next slides.
 * @returns The index of each previous slide among the next slides, or
 *   `undefined` if it was removed.
 */
export function alignSlides(
  previous: readonly (string | undefined)[],
  next: readonly (string | undefined)[],
): (number | undefined)[] {
  const nextIndices = new Map<string, number>();
  for (const [index, id] of next.entries()) {
    if (id !== undefined && !nextIndices.has(id)) {
      nextIndices.set(id, index);
    }
  }
  const previousIds = new Set(previous);
  const used = new Set<number>();
  const anchors = previous.map((id) => {
    const index = id === undefined ? undefined : nextIndices.get(id);
    if (index === undefined || used.has(index)) {
      return undefined;
    }
    used.add(index);
    return index;
  });
  return anchors.map((anchor, index) => {
    if (anchor !== undefined) {
      return anchor;
    }
    let before = index - 1;
    while (before >= 0 && anchors[before] === undefined) {
      before -= 1;
    }
    let after = index + 1;
    while (after < anchors.length && anchors[after] === undefined) {
      after += 1;
    }
    const candidate = (anchors[before] ?? -1) + index - before;
    const limit = anchors[after] ?? next.length;
    if (candidate >= limit || used.has(candidate)) {
      return undefined;
    }
    // A slide with an id that the previous slides had isn't a new one.
    const id = next[candidate];
    if (id !== undefined && previousIds.has(id)) {
      return undefined;
    }
    used.add(candidate);
    return candidate;
  });
}
