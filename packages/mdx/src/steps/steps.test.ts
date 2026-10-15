import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('steps', () => {
  async function content(source: string): Promise<unknown> {
    return (await slides(source)).map(({ children }) => children);
  }

  it('shows list items together with the previous step', async () => {
    expect(await content('- One\n- Two\n\n1. Three')).toEqual([
      '<ul>\n<Step component="li" with="previous">One</Step>\n' +
        '<Step component="li" with="previous">Two</Step>\n</ul>' +
        '<ol>\n<Step component="li" with="previous">Three</Step>\n</ol>',
    ]);
  });

  it('applies the attributes of :step', async () => {
    expect(
      await content(`
- One :step{with=initial}
- *Two* :step{#two .wide data-x=y}
- Three :step{with=previous}
`),
    ).toEqual([
      '<ul>\n<Step component="li" with="initial">One</Step>\n' +
        '<Step component="li" className="wide" id="two" data-x="y">' +
        '<em>Two</em></Step>\n' +
        '<Step component="li" with="previous">Three</Step>\n</ul>',
    ]);
  });

  it('reads :step before nested lists', async () => {
    expect(
      await content(`
- One :step
  - Nested :step

- Loose :step

  More :step
`),
    ).toEqual([
      '<ul>\n<Step component="li">\n<p>One</p>\n<ul>\n' +
        '<Step component="li">Nested</Step>\n</ul>\n</Step>\n' +
        '<Step component="li">\n<p>Loose</p>\n<Step component="p">More</Step>\n</Step>\n</ul>',
    ]);
  });

  it('turns other paragraphs with :step into steps', async () => {
    expect(
      await content(
        'Up front\n\n:step Later\n\nWith it :step{with=previous .a}',
      ),
    ).toEqual([
      '<p>Up front</p><Step component="p">Later</Step>' +
        '<Step component="p" with="previous" className="a">With it</Step>',
    ]);
  });

  it('reads :step at the start of items', async () => {
    expect(
      await content(`
- :step One
- :step{.a data-x=y} *Two*
- :step{with=initial}
`),
    ).toEqual([
      '<ul>\n<Step component="li">One</Step>\n' +
        '<Step component="li" className="a" data-x="y"><em>Two</em></Step>\n' +
        '<Step component="li" with="initial"></Step>\n</ul>',
    ]);
  });

  it('shares steps in groups', async () => {
    expect(
      await content(`
- :step{group=a} A1
- :step{group=b} B1
- :step{group=a} A2
- :step{group=b with=previous} B2
`),
    ).toEqual([
      '<ul>\n<Step component="li" group="a">A1</Step>\n' +
        '<Step component="li" group="b">B1</Step>\n' +
        '<Step component="li" group="a">A2</Step>\n' +
        '<Step component="li" with="previous" group="b">B2</Step>\n</ul>',
    ]);
  });

  it('reports groups used only once on a slide', async () => {
    const file = await compile(
      `
## One

- :step{group=a} A
- :step{group=typo} B

<Step group="a">C</Step>

## Two

- :step{group=a} D
`,
      { ...sliderMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      '5:1-5:22: The step group `typo` is only used once on the slide',
      '11:1-11:19: The step group `a` is only used once on the slide',
    ]);
  });

  it('warns about with on groups that already exist', async () => {
    const file = await compile(
      `
- :step{group=a with=initial} A
- :step{group=b} B
- :step{group=a} C
- :step{group=b with=previous} D
  - :step{group=b with=initial} E
`,
      { ...sliderMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      '5:1-6:34: Ignoring `with=previous` on the step group `b`, which is placed by its first element',
      '6:3-6:34: Ignoring `with=initial` on the step group `b`, which is placed by its first element',
    ]);
  });

  it('keeps braces that are not attribute blocks', async () => {
    expect(await content('- Set \\{x}')).toEqual([
      '<ul>\n<Step component="li" with="previous">Set {x}</Step>\n</ul>',
    ]);
  });

  it('reports invalid steps', async () => {
    const file = await compile('- A :step{with=next}\n\n## B :step', {
      ...sliderMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Expected `with=previous` or `with=initial`'),
      expect.stringContaining("Ignoring `:step`, which isn't allowed here"),
    ]);
  });

  it('nests steps in groups with in', async () => {
    const file = await compile(
      `
- :step{group=a} A

:step{in=a} Callout

:step{in=typo} Lost
`,
      { ...sliderMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('There is no step group `typo`'),
    ]);
    expect(
      await content('- :step{group=a} A\n\n:step{in=a .note} Callout'),
    ).toEqual([
      '<ul>\n<Step component="li" group="a">A</Step>\n</ul>' +
        '<Step component="p" className="note" in="a">Callout</Step>',
    ]);
  });

  it('places steps after groups with after, and titles them', async () => {
    const file = await compile(
      `
- :step{group=a} A
- :step B

:step{after=a} After

:step{after=typo} Lost
`,
      { ...sliderMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining(
        'There is no step group `typo` on the slide to place a step after',
      ),
    ]);
    expect(
      await content(
        '- :step{group=a title="First item"} A\n\n:step{after=a} B',
      ),
    ).toEqual([
      '<ul>\n<Step component="li" group="a" title="First item">A</Step>\n</ul>' +
        '<Step component="p" after="a">B</Step>',
    ]);
  });

  it('passes shorthands of variants to the step', async () => {
    expect(await content('- :step{only} A\n\n:step{dim} B')).toEqual([
      '<ul>\n<Step component="li" only="">A</Step>\n</ul>' +
        '<Step component="p" dim="">B</Step>',
    ]);
  });
});
