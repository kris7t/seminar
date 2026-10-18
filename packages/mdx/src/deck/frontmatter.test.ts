import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';

import { readDeckFrontmatter } from './frontmatter.ts';

describe('readDeckFrontmatter', () => {
  it('reads the frontmatter', () => {
    expect(
      readDeckFrontmatter('---\ntitle: Talk\nlang: hu\n---\n\n# Slide'),
    ).toEqual({
      title: 'Talk',
      lang: 'hu',
      mouseNavigation: true,
      mirrorPointer: false,
      depth: 1,
    });
  });

  it('takes the title from the first heading that starts a slide', () => {
    expect(
      readDeckFrontmatter(
        '---\ndepth: 2\n---\n\nIntro\n\n### Not a slide\n\n## First :slide{#first}',
      ),
    ).toEqual({
      title: 'First',
      mouseNavigation: true,
      mirrorPointer: false,
      depth: 2,
    });
  });

  it('takes the title from the first heading if no heading starts a slide', () => {
    expect(
      readDeckFrontmatter('---\ndepth: 0\n---\n\n### Heading\n\n# Other'),
    ).toMatchObject({ title: 'Heading', depth: 0 });
  });

  it.each([
    ['Text', 0],
    ['# A\n\n## B', 2],
    ['## A\n\n### B\n\n#### C', 4],
    ['# A\n\n##### B\n\n###### C', 4],
  ])('detects the depth of %j', (source, depth) => {
    expect(readDeckFrontmatter(source)).toMatchObject({ depth });
  });

  it('reads decks with the syntax of plugins', () => {
    expect(
      readDeckFrontmatter('## Slide\n\n$e^{i\\pi}$', undefined, [remarkMath]),
    ).toEqual({
      title: 'Slide',
      mouseNavigation: true,
      mirrorPointer: false,
      depth: 2,
    });
  });

  it('works without a title', () => {
    expect(readDeckFrontmatter('Text')).toEqual({
      mouseNavigation: true,
      mirrorPointer: false,
      depth: 0,
    });
  });
});
