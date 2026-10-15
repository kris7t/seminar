import { describe, expect, it } from 'vitest';

import { formatLocation, parseLocation } from './location.ts';

const IDS = ['intro', undefined];

describe('parseLocation', () => {
  it('parses slides by id or number, and step paths', () => {
    expect(parseLocation('#intro', IDS)).toEqual({ slideIndex: 0, step: [] });
    expect(parseLocation('#slide=2&step=2.1', IDS)).toEqual({
      slideIndex: 1,
      step: [2, 1],
    });
    expect(parseLocation('#missing', IDS)).toBeUndefined();
  });

  it('parses step paths starting with the name of a group', () => {
    expect(parseLocation('#intro&step=parse', IDS)).toEqual({
      slideIndex: 0,
      step: [],
      group: 'parse',
    });
    expect(parseLocation('#intro&step=my%20group.1.x', IDS)).toEqual({
      slideIndex: 0,
      step: [1],
      group: 'my group',
    });
  });
});

describe('formatLocation', () => {
  it('formats locations that parse back', () => {
    for (const location of [
      { slideIndex: 0, step: [] },
      { slideIndex: 1, step: [2, 1] },
      { slideIndex: 0, step: [], group: 'parse' },
      { slideIndex: 1, step: [1], group: 'my group' },
    ]) {
      expect(parseLocation(formatLocation(location, IDS), IDS)).toEqual(
        location,
      );
    }
    expect(formatLocation({ slideIndex: 0, step: [1], group: 'a' }, IDS)).toBe(
      '#intro&step=a.1',
    );
  });
});
