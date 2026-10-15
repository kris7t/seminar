import { describe, expect, it } from 'vitest';

import type { ResolvedTocEntry } from '../toc/tableOfContents.ts';
import { findAdjacentGroup, groupSlides } from './groupSlides.ts';

function entry(
  slideIndex: number,
  children: ResolvedTocEntry[] = [],
): ResolvedTocEntry {
  return { slideIndex, title: `Slide ${String(slideIndex + 1)}`, children };
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

  it('puts all slides into one group without divisions', () => {
    expect(groupSlides([entry(0), entry(1)], 3)).toEqual([
      { level: 0, slides: [0, 1, 2] },
    ]);
  });
});
