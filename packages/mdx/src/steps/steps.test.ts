import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { seminarMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('steps', () => {
  async function content(source: string): Promise<unknown> {
    return (await slides(source)).map(({ children }) => children);
  }

  async function notesOf(source: string): Promise<unknown> {
    return (await slides(source)).map(({ notes }) => notes);
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

  it('renders the content of :step[…] in a span', async () => {
    expect(
      await content(
        'Up front :step[later]{group=a} and :step[*custom*]{component=strong}',
      ),
    ).toEqual([
      '<Paragraph>Up front <Step component="span" group="a">later</Step> and ' +
        '<Step component="strong"><em>custom</em></Step></Paragraph>',
    ]);
  });

  it('keeps bare :step next to :step[…]', async () => {
    expect(await content(':step Later, with :step[a span]')).toEqual([
      '<Paragraph step=true>Later, with <Step component="span">a span</Step></Paragraph>',
    ]);
    expect(
      await content('- :step[Span] in an item :step{with=initial}'),
    ).toEqual([
      '<ul>\n<ListItem step=true with="initial"><Step component="span">Span</Step> in an item</ListItem>\n</ul>',
    ]);
  });

  it('renders ::step[…] as a paragraph in a step', async () => {
    expect(
      await content('::step[Later]{.a}\n\n::step[Heading]{component=h4}'),
    ).toEqual([
      '<Paragraph step=true className="a">Later</Paragraph>' +
        '<Step component="h4">Heading</Step>',
    ]);
  });

  it('renders the content of :::step in a div', async () => {
    expect(
      await content(`
:::step{#box}
One

- Two
:::

:::step{component=section only}
Three :step
:::
`),
    ).toEqual([
      '<Step component="div" id="box"><Paragraph>One</Paragraph><ul>\n' +
        '<ListItem>Two</ListItem>\n</ul></Step>' +
        '<Step component="section" only=""><Paragraph step=true>Three</Paragraph></Step>',
    ]);
  });

  it('shows the content of step directives in notes', async () => {
    expect(
      await notesOf(`
:::notes
Say :step[this] later.

:::step
Then that.
:::
:::
`),
    ).toEqual(['<p>Say this later.</p><p>Then that.</p>']);
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

  it('keeps braces that are not attribute blocks', async () => {
    expect(await content('- Set \\{x}')).toEqual([
      '<ul>\n<ListItem>Set {x}</ListItem>\n</ul>',
    ]);
  });

  it('reports invalid steps', async () => {
    const file = await compile('- A :step{with=next}\n\n## B :step', {
      ...seminarMdxOptions(),
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

:step{in=diagram} In a group of a component, e.g., of a diagram
`,
      { ...seminarMdxOptions() },
    );
    // Components may have groups that the compiler doesn't see.
    expect(file.messages).toEqual([]);
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

:step{after=diagram} After a group of a component
`,
      { ...seminarMdxOptions() },
    );
    expect(file.messages).toEqual([]);
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
