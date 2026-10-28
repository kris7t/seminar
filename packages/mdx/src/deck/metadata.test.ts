import { describe, expect, it } from 'vitest';

import { getDeckMetadata } from './metadata.ts';

describe('getDeckMetadata', () => {
  it('reads the metadata from the frontmatter', () => {
    expect(
      getDeckMetadata({
        title: 'Engines',
        author: ['Ada Lovelace', 'Charles Babbage'],
        event: 'Royal Society',
        date: '1843-10-28',
        description: 'What the engine can do',
        keywords: 'engines, computing',
        theme: './theme.tsx',
      }),
    ).toEqual({
      title: 'Engines',
      authors: ['Ada Lovelace', 'Charles Babbage'],
      event: 'Royal Society',
      date: '1843-10-28',
      description: 'What the engine can do',
      keywords: ['engines', 'computing'],
    });
  });

  it('takes single authors, lists of keywords, and years as numbers', () => {
    expect(
      getDeckMetadata({
        author: 'Ada Lovelace',
        keywords: ['engines', 'computing'],
        date: 1843,
      }),
    ).toEqual({
      authors: ['Ada Lovelace'],
      keywords: ['engines', 'computing'],
      date: '1843',
    });
  });

  it('reports and leaves out values of the wrong type', () => {
    const messages: string[] = [];
    expect(
      getDeckMetadata(
        { title: { nested: true }, author: ['Ada', 3, null], keywords: '' },
        (message) => messages.push(message),
      ),
    ).toEqual({});
    expect(messages).toEqual([
      'Expected `title` in the frontmatter to be a text',
      'Expected `author` in the frontmatter to be a name or a list of names',
      'Expected `keywords` in the frontmatter to be a list of keywords',
    ]);
  });
});
