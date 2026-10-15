import { describe, expect, it } from 'vitest';

import type { ResolvedTocEntry } from '../toc/tableOfContents.ts';
import { findAdjacentGroup, groupSlides } from './groupSlides.ts';

function entry(
  slideIndex: number,
  children: ResolvedTocEntry[] = [],
): ResolvedTocEntry {
  return {
    slideIndex,
    hasSlide: true,
    title: `Slide ${String(slideIndex + 1)}`,
    children,
  };
}

/** An entry without a slide, which starts at its first nested entry. */
function division(
  title: string,
  children: [ResolvedTocEntry, ...ResolvedTocEntry[]],
): ResolvedTocEntry {
  return {
    slideIndex: children[0].slideIndex,
    hasSlide: false,
    title,
    children,
  };
}

describe('groupSlides', () => {
  it('groups slides by divisions', () => {
    const toc = [
      entry(1, [entry(2, [entry(3), entry(4)]), entry(5, [entry(6)])]),
    ];
    const groups = groupSlides(toc, 8);
    expect(
      groups.map(({ title, level, slides }) => [title, level, slides]),
    ).toEqual([
      [undefined, 0, [0]],
      ['Slide 2', 0, [1]],
      ['Slide 3', 1, [2, 3, 4]],
      ['Slide 6', 1, [5, 6, 7]],
    ]);
    expect(findAdjacentGroup(groups, 3, 1)).toBe(5);
    expect(findAdjacentGroup(groups, 3, -1)).toBe(1);
    expect(findAdjacentGroup(groups, 7, 1)).toBeUndefined();
  });

  it('groups slides by divisions without slides', () => {
    const toc = [
      division('Main', [entry(0, [entry(1)]), entry(2, [entry(3)])]),
      division('Backup', [entry(4), entry(5)]),
    ];
    const groups = groupSlides(toc, 6);
    expect(
      groups.map(({ title, level, slides }) => [title, level, slides]),
    ).toEqual([
      // Starts with a nested division, so it has no slides of its own.
      ['Main', 0, []],
      ['Slide 1', 1, [0, 1]],
      ['Slide 3', 1, [2, 3]],
      ['Backup', 0, [4, 5]],
    ]);
    expect(findAdjacentGroup(groups, 0, -1)).toBeUndefined();
    expect(findAdjacentGroup(groups, 3, 1)).toBe(4);
  });

  it('puts all slides into one group without divisions', () => {
    expect(groupSlides([entry(0), entry(1)], 3)).toEqual([
      { level: 0, start: 0, slides: [0, 1, 2] },
    ]);
  });
});
