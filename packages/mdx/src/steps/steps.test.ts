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
      '<ul>\n<ListItem>One</ListItem>\n' +
        '<ListItem>Two</ListItem>\n</ul>' +
        '<ol>\n<ListItem>Three</ListItem>\n</ol>',
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
      '<ul>\n<ListItem step=true with="initial">One</ListItem>\n' +
        '<ListItem step=true className="wide" id="two" data-x="y">' +
        '<em>Two</em></ListItem>\n' +
        '<ListItem step=true with="previous">Three</ListItem>\n</ul>',
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
      '<ul>\n<ListItem step=true>\n<p>One</p>\n<ul>\n' +
        '<ListItem step=true>Nested</ListItem>\n</ul>\n</ListItem>\n' +
        '<ListItem step=true>\n<p>Loose</p>\n<Paragraph step=true>More</Paragraph>\n</ListItem>\n</ul>',
    ]);
  });

  it('turns other paragraphs with :step into steps', async () => {
    expect(
      await content(
        'Up front\n\n:step Later\n\nWith it :step{with=previous .a}',
      ),
    ).toEqual([
      '<Paragraph>Up front</Paragraph><Paragraph step=true>Later</Paragraph>' +
        '<Paragraph step=true with="previous" className="a">With it</Paragraph>',
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
      '<ul>\n<ListItem step=true>One</ListItem>\n' +
        '<ListItem step=true className="a" data-x="y"><em>Two</em></ListItem>\n' +
        '<ListItem step=true with="initial"></ListItem>\n</ul>',
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
      '<ul>\n<ListItem step=true group="a">A1</ListItem>\n' +
        '<ListItem step=true group="b">B1</ListItem>\n' +
        '<ListItem step=true group="a">A2</ListItem>\n' +
        '<ListItem step=true with="previous" group="b">B2</ListItem>\n</ul>',
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
      '<ul>\n<ListItem>Set {x}</ListItem>\n</ul>',
    ]);
  });

  it('reports invalid steps', async () => {
    const file = await compile('- A :step{with=next}\n\n## B :step', {
      ...sliderMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining(
        'Expected `with=self`, `with=previous`, or `with=initial`',
      ),
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
      '<ul>\n<ListItem step=true group="a">A</ListItem>\n</ul>' +
        '<Paragraph step=true className="note" in="a">Callout</Paragraph>',
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
      '<ul>\n<ListItem step=true group="a" title="First item">A</ListItem>\n</ul>' +
        '<Paragraph step=true after="a">B</Paragraph>',
    ]);
  });

  it('passes shorthands of behaviors to the step', async () => {
    expect(await content('- :step{only} A\n\n:step{dim} B')).toEqual([
      '<ul>\n<ListItem step=true only="">A</ListItem>\n</ul>' +
        '<Paragraph step=true dim="">B</Paragraph>',
    ]);
  });
});
