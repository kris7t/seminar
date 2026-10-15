import { describe, expect, it } from 'vitest';

import {
  compareStepPaths,
  isInStepRange,
  parseStepBound,
  parseStepRange,
  type StepRange,
} from './stepRange.ts';
import type { StepPath } from './StepStore.ts';

/** The steps of a slide with steps 1 and 2, where 1 has the substeps 1.1-1.2. */
const POSITIONS: StepPath[] = [[], [1], [1, 1], [1, 2], [2]];

/** Returns the steps of {@link POSITIONS} in `range`, by their paths. */
function inRange(range: StepRange, groups: Record<string, StepPath> = {}) {
  const bounds = parseStepRange(range);
  return POSITIONS.filter((path) =>
    isInStepRange(path, bounds, ({ group, path: relative }) => {
      if (group === undefined) {
        return relative;
      }
      const groupPath = groups[group];
      return groupPath === undefined ? undefined : [...groupPath, ...relative];
    }),
  ).map((path) => path.join('.'));
}

describe('step ranges', () => {
  it('parses bounds, which may start with the name of a group', () => {
    expect(parseStepBound('1.2')).toEqual({ path: [1, 2], nested: true });
    expect(parseStepBound('1.0')).toEqual({ path: [1, 0], nested: false });
    expect(parseStepBound('parse.1')).toEqual({
      group: 'parse',
      path: [1],
      nested: true,
    });
    expect(parseStepBound('parse')).toEqual({
      group: 'parse',
      path: [],
      nested: true,
    });
    expect(parseStepBound('1.x')).toBeUndefined();
    expect(parseStepBound('')).toBeUndefined();
  });

  it('compares paths in the order of going through the slide', () => {
    expect(compareStepPaths([1], [1, 0])).toBe(0);
    expect(compareStepPaths([1], [1, 1])).toBeLessThan(0);
    expect(compareStepPaths([1, 9], [2])).toBeLessThan(0);
  });

  it('starts at inclusive or exclusive bounds', () => {
    expect(inRange({ from: '1' })).toEqual(['1', '1.1', '1.2', '2']);
    expect(inRange({ from: '1.1' })).toEqual(['1.1', '1.2', '2']);
    // A step stands for the steps nested in it, too, unless it ends with .0.
    expect(inRange({ after: '1' })).toEqual(['2']);
    expect(inRange({ after: '1.0' })).toEqual(['1.1', '1.2', '2']);
  });

  it('ends at inclusive or exclusive bounds', () => {
    expect(inRange({ to: '1' })).toEqual(['', '1', '1.1', '1.2']);
    expect(inRange({ to: '1.0' })).toEqual(['', '1']);
    expect(inRange({ before: '1.2' })).toEqual(['', '1', '1.1']);
    expect(inRange({ before: '1' })).toEqual(['']);
    expect(inRange({ after: '1.0', before: '2' })).toEqual(['1.1', '1.2']);
  });

  it('resolves groups, and ignores bounds of missing groups', () => {
    expect(inRange({ from: 'a', to: 'a.1' }, { a: [1] })).toEqual(['1', '1.1']);
    expect(inRange({ after: 'missing' })).toEqual(['', '1', '1.1', '1.2', '2']);
  });
});
