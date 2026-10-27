import { describe, expect, it } from 'vitest';

import {
  parseOverlay,
  parseSlideSplit,
  parseStepSplit,
  planSplit,
  resolveStepSplit,
} from './stepSplit.ts';

function summarize(split: ReturnType<typeof parseStepSplit>) {
  return split === undefined
    ? undefined
    : { mode: split.mode, points: split.points && [...split.points] };
}

describe('parseStepSplit', () => {
  it('reads modes and points, and a bare split as initial', () => {
    expect(summarize(parseStepSplit('none initial'))).toEqual({
      mode: 'none',
      points: ['initial'],
    });
    expect(summarize(parseStepSplit(['before', 'last']))).toEqual({
      mode: undefined,
      points: ['before', 'last'],
    });
    expect(summarize(parseStepSplit(''))).toEqual({
      mode: undefined,
      points: ['initial'],
    });
    expect(summarize(parseStepSplit(false))).toEqual({
      mode: 'none',
      points: [],
    });
    expect(parseStepSplit(undefined)).toBeUndefined();
  });

  it('fills in what a split leaves out from the default', () => {
    expect(summarize(resolveStepSplit('before', 'each'))).toEqual({
      mode: 'each',
      points: ['before'],
    });
    expect(summarize(resolveStepSplit('none', 'each last'))).toEqual({
      mode: 'none',
      points: ['last'],
    });
    expect(summarize(resolveStepSplit(false, 'each last'))).toEqual({
      mode: 'none',
      points: [],
    });
  });
});

describe('parseSlideSplit', () => {
  it('reads a mode, or steps, which default to no other pages', () => {
    expect(parseSlideSplit('none')).toEqual({ mode: 'none', pages: [] });
    expect(parseSlideSplit('1, parse.2')).toEqual({
      mode: 'none',
      pages: [
        { group: undefined, path: [1], nested: true },
        { group: 'parse', path: [2], nested: true },
      ],
    });
    expect(parseSlideSplit('auto 2')?.mode).toBe('auto');
    expect(parseSlideSplit(undefined)).toBeUndefined();
  });
});

describe('parseOverlay', () => {
  it('reads flags from props and MDX', () => {
    expect(parseOverlay('')).toBe(true);
    expect(parseOverlay('false')).toBe(false);
    expect(parseOverlay(undefined)).toBeUndefined();
  });
});

describe('planSplit', () => {
  it('chooses the last state if everything stays shown', () => {
    expect(planSplit(4, [new Set([1, 2, 3]), new Set([2, 3])], [])).toEqual([
      3,
    ]);
  });

  it('chooses the state before content is hidden', () => {
    expect(
      planSplit(4, [new Set([1]), new Set([2]), new Set([1, 2, 3])], []),
    ).toEqual([1, 2, 3]);
  });

  it('chooses as few states as possible for overlapping content', () => {
    expect(
      planSplit(5, [new Set([0, 1, 2]), new Set([1, 2, 3]), new Set([4])], []),
    ).toEqual([2, 4]);
  });

  it('keeps forced states, which also show content', () => {
    expect(planSplit(4, [new Set([1]), new Set([0, 1, 2])], [0])).toEqual([
      0, 1, 3,
    ]);
    expect(planSplit(4, [new Set([1, 3])], [])).toEqual([3]);
  });

  it('chooses nothing without states', () => {
    expect(planSplit(0, [], [0])).toEqual([]);
  });
});
