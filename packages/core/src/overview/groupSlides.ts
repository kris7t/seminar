import type { ReactNode } from 'react';

import type { ResolvedTocEntry } from '../toc/tableOfContents.ts';

/** The deepest level of divisions, e.g., subsections. */
const MAX_LEVEL = 2;

/** A division of the deck in the overview, e.g., a section. */
export interface SlideGroup {
  /** The title of the division, or `undefined` for slides before the first. */
  title?: ReactNode;
  /** The level of the division: 0 for titles, 1 for sections, and so on. */
  level: number;
  /** Indices of the slides of the group, starting with its own slide. */
  slides: number[];
}

/**
 * Groups the slides of a deck by the divisions of its table of contents: the
 * entries with nested entries, like the title, section, and subsection slides
 * of decks written in MDX. Each group runs from the slide of its division to
 * the slide of the next one. Without divisions, all slides form a single group.
 */
export function groupSlides(
  toc: readonly ResolvedTocEntry[],
  slideCount: number,
): SlideGroup[] {
  const divisions: { slideIndex: number; title: ReactNode; level: number }[] =
    [];
  const visit = (entries: readonly ResolvedTocEntry[], level: number) => {
    for (const { slideIndex, title, children } of entries) {
      if (children.length > 0) {
        divisions.push({
          slideIndex,
          title,
          level: Math.min(level, MAX_LEVEL),
        });
        visit(children, level + 1);
      }
    }
  };
  visit(toc, 0);
  divisions.sort((a, b) => a.slideIndex - b.slideIndex);
  const range = (start: number, end: number) =>
    Array.from({ length: Math.max(end - start, 0) }, (_, i) => start + i);
  const groups: SlideGroup[] = [];
  const firstStart = divisions[0]?.slideIndex ?? slideCount;
  if (firstStart > 0) {
    groups.push({ level: 0, slides: range(0, firstStart) });
  }
  for (const [i, { slideIndex, title, level }] of divisions.entries()) {
    const end = divisions[i + 1]?.slideIndex ?? slideCount;
    // Divisions on the same slide, e.g., in a hand-written table of contents.
    if (end > slideIndex) {
      groups.push({ title, level, slides: range(slideIndex, end) });
    }
  }
  return groups;
}

/**
 * Returns the first slide of the group before or after the group of
 * `slideIndex`, or `undefined` if there is none.
 */
export function findAdjacentGroup(
  groups: readonly SlideGroup[],
  slideIndex: number,
  direction: 1 | -1,
): number | undefined {
  const current = groups.findIndex(({ slides }) => slides.includes(slideIndex));
  return groups[current + direction]?.slides[0];
}
