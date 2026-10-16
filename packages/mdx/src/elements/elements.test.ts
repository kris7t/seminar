import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('slide elements', () => {
  it('names the elements with ids on a slide', async () => {
    expect(
      (
        await slides(`
## One

<img id="arch" src="arch.svg" />

- :step{#parse} Parse
`)
      ).map(({ children }) => children),
    ).toEqual([
      '<SlideElement as="img" name="arch" src="arch.svg"></SlideElement>' +
        '<ul>\n<Step component="li" id="parse">Parse</Step>\n</ul>',
    ]);
  });

  it('reports ids used more than once, but not groups of ids', async () => {
    const file = await compile(
      `
## One

- :step{#a} A
- :step{group=a} B

<span id="a">C</span>

:step{#solo} D

## Two

<span id="a">E</span>
`,
      { ...sliderMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      '7:1-7:22: The id `a` is used more than once on the slide',
    ]);
  });
});
