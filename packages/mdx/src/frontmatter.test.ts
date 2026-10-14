import { describe, expect, it } from 'vitest';

import { readDeckFrontmatter } from './frontmatter.ts';

describe('readDeckFrontmatter', () => {
  it('reads the frontmatter', () => {
    expect(
      readDeckFrontmatter('---\ntitle: Talk\nlang: hu\n---\n\n# Slide'),
    ).toEqual({ title: 'Talk', lang: 'hu', mouseNavigation: true });
  });

  it('takes the title from the first heading', () => {
    expect(
      readDeckFrontmatter('Intro\n\n### Not a slide\n\n## First \\{#first}'),
    ).toEqual({ title: 'First', mouseNavigation: true });
  });

  it('reads decks with math', () => {
    expect(readDeckFrontmatter('## Slide\n\n$e^{i\\pi}$')).toEqual({
      title: 'Slide',
      mouseNavigation: true,
    });
  });

  it('works without a title', () => {
    expect(readDeckFrontmatter('Text')).toEqual({ mouseNavigation: true });
  });
});
