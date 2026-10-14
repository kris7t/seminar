import { compile, evaluate } from '@mdx-js/mdx';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from './options.ts';

type SlideSummary = Record<string, unknown>;

const STUB_URL = new URL('test-stub.ts', import.meta.url).href;
const THEME_URL = new URL('test-theme.ts', import.meta.url).href;

async function compileDeck(source: string) {
  const module = await evaluate(source, {
    ...runtime,
    ...sliderMdxOptions({
      importSource: STUB_URL,
    }),
    baseUrl: import.meta.url,
  });
  return module as typeof module & { frontmatter: Record<string, unknown> };
}

/**
 * Whether `node` is an element of the stub component `name`. The document
 * imports the stub separately from the tests, so compare components by name.
 */
function isComponent<P>(
  node: ReactNode,
  name: string,
): node is ReactElement<P> {
  return (
    isValidElement(node) &&
    typeof node.type === 'function' &&
    node.type.name === name
  );
}

function renderDeck(
  module: Awaited<ReturnType<typeof compileDeck>>,
  props: Record<string, unknown> = {},
): ReactElement<{ children: ReactNode[] }> {
  // The MDX types use the global JSX namespace, which React 19 doesn't define.
  const element = (module.default as (props: object) => ReactNode)(props);
  if (!isComponent<{ children: ReactNode[] }>(element, 'Deck')) {
    throw new Error('Expected a Deck');
  }
  return element;
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) {
    return node.map(text).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (typeof node.type === 'string') {
      return `<${node.type}>${text(node.props.children)}</${node.type}>`;
    }
    // Show components with their props, e.g., `<Step with="previous">`.
    const { children, ...props } = node.props;
    const name = typeof node.type === 'function' ? node.type.name : 'component';
    const attributes = Object.entries(props).map(
      ([key, value]) => ` ${key}=${JSON.stringify(value)}`,
    );
    return `<${name}${attributes.join('')}>${text(children)}</${name}>`;
  }
  return typeof node === 'string' ? node : '';
}

/** Summarizes the slides of the deck, with titles and children as text. */
async function slides(source: string): Promise<SlideSummary[]> {
  const deck = renderDeck(await compileDeck(source));
  return [deck.props.children].flat().map((slide) => {
    if (!isComponent<Record<string, unknown>>(slide, 'Slide')) {
      throw new Error('Expected a Slide');
    }
    const { children, title, master, ...props } = slide.props;
    return {
      // Show component masters by the name of the component.
      master: typeof master === 'function' ? `<${master.name}>` : master,
      ...props,
      ...(title === undefined ? {} : { title: text(title as ReactNode) }),
      children: text(children as ReactNode),
    };
  });
}

describe('remarkSlides', () => {
  it('creates slides from headings and slide breaks', async () => {
    expect(
      await slides(`
# Talk

Speaker

## Introduction

Body

***

More
`),
    ).toEqual([
      {
        master: 'title',
        id: 'talk',
        title: 'Talk',
        children: '<p>Speaker</p>',
      },
      {
        master: 'content',
        id: 'introduction',
        title: 'Introduction',
        children: '<p>Body</p>',
      },
      { master: 'content', children: '<p>More</p>' },
    ]);
  });

  it('keeps content before the first slide break', async () => {
    expect(await slides('Intro\n\n## Next')).toEqual([
      { master: 'content', children: '<p>Intro</p>' },
      { master: 'content', id: 'next', title: 'Next', children: '' },
    ]);
  });

  it('keeps markup in titles', async () => {
    expect(await slides('## Hello *world*')).toEqual([
      {
        master: 'content',
        id: 'hello-world',
        title: 'Hello <em>world</em>',
        children: '',
      },
    ]);
  });

  it('keeps deeper headings in the content', async () => {
    expect(
      await slides('---\ndepth: 2\n---\n\n## Slide\n\n### Section\n\nText'),
    ).toEqual([
      {
        master: 'content',
        id: 'slide',
        title: 'Slide',
        children: '<h3>Section</h3><p>Text</p>',
      },
    ]);
  });

  it('treats all thematic breaks as slide breaks', async () => {
    expect(await slides('One\n\n---\n\nTwo\n\n___\n\nThree')).toEqual([
      { master: 'content', children: '<p>One</p>' },
      { master: 'content', children: '<p>Two</p>' },
      { master: 'content', children: '<p>Three</p>' },
    ]);
  });

  it('applies attribute blocks in their own paragraph', async () => {
    expect(
      await slides(`
## Results

\\{#res master=section}

Numbers

---

\\{#end}

\\{not=applied}
`),
    ).toEqual([
      {
        master: 'section',
        id: 'res',
        title: 'Results',
        children: '<p>Numbers</p>',
      },
      { master: 'content', id: 'end', children: '<p>{not=applied}</p>' },
    ]);
  });

  it('applies attribute blocks escaped by formatters', async () => {
    expect(await slides('\\*\\*\\* \\{#end}\n\nDone')).toEqual([
      { master: 'content', id: 'end', children: '<p>Done</p>' },
    ]);
  });

  it('makes slide ids unique', async () => {
    expect((await slides('## Intro\n\n## Intro')).map(({ id }) => id)).toEqual([
      'intro',
      'intro-1',
    ]);
  });

  it('applies attribute blocks', async () => {
    expect(
      await slides(`
## Results \\{#res master=section note="a b"}

*** \\{#summary master=closing}

Done
`),
    ).toEqual([
      {
        master: 'section',
        id: 'res',
        note: 'a b',
        title: 'Results',
        children: '',
      },
      { master: 'closing', id: 'summary', children: '<p>Done</p>' },
    ]);
  });

  it('passes props to the deck, with defaults from the frontmatter', async () => {
    const module = await compileDeck(`---
mouseNavigation: false
author: Someone
---

## Slide
`);
    expect(module.frontmatter).toEqual({
      title: 'Slide',
      mouseNavigation: false,
      author: 'Someone',
      depth: 2,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: false,
    });
    expect(
      renderDeck(module, { defaultMouseNavigation: true, theme: 'x' }).props,
    ).toMatchObject({ defaultMouseNavigation: true, theme: 'x' });
  });

  it('fills in defaults for the frontmatter', async () => {
    const module = await compileDeck(
      'Intro\n\n## First \\{#first}\n\n# Second',
    );
    expect(module.frontmatter).toEqual({
      title: 'First',
      mouseNavigation: true,
      depth: 2,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: true,
    });
  });

  it('keeps the title in the frontmatter', async () => {
    const module = await compileDeck('---\ntitle: Talk\n---\n\n# Slide');
    expect(module.frontmatter).toMatchObject({ title: 'Talk' });
  });

  it('uses the theme from the frontmatter', async () => {
    const module = await compileDeck(
      `---\ntheme: ${THEME_URL}\n---\n\n# Slide`,
    );
    expect(renderDeck(module).props).toMatchObject({
      theme: { name: 'test theme' },
    });
    expect(renderDeck(module, { theme: undefined }).props).toMatchObject({
      theme: { name: 'test theme' },
    });
    expect(renderDeck(module, { theme: 'override' }).props).toMatchObject({
      theme: 'override',
    });
  });

  it('uses the defaults passed as options', async () => {
    const options = sliderMdxOptions({
      importSource: STUB_URL,
      defaultTheme: THEME_URL,
      defaultMouseNavigation: false,
    });
    const module = (await evaluate('# Slide', {
      ...runtime,
      ...options,
      baseUrl: import.meta.url,
    })) as Awaited<ReturnType<typeof compileDeck>>;
    expect(module.frontmatter).toEqual({
      title: 'Slide',
      mouseNavigation: false,
      theme: THEME_URL,
      depth: 1,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: false,
      theme: { name: 'test theme' },
    });
  });

  it('reports invalid themes in the frontmatter', async () => {
    const file = await compile('---\ntheme: 42\n---\n\n# Slide', {
      ...sliderMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Expected `theme` in the frontmatter'),
    ]);
  });

  it('keeps exports of the document', async () => {
    const module = await compileDeck('export const answer = 42\n\n## Slide');
    expect((module as unknown as { answer: number }).answer).toBe(42);
  });

  describe('depth', () => {
    const DOCUMENT = '# A\n\n## B\n\n### C\n\n#### D\n\nText';

    async function masters(depth: number | undefined) {
      const frontmatter =
        depth === undefined ? '' : `---\ndepth: ${String(depth)}\n---\n\n`;
      return (await slides(frontmatter + DOCUMENT)).map(
        ({ master, title, children }) =>
          [master, title, children] as [unknown, unknown, unknown],
      );
    }

    it('only starts slides at slide breaks with depth 0', async () => {
      expect(await masters(0)).toEqual([
        [
          'content',
          undefined,
          '<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><p>Text</p>',
        ],
      ]);
    });

    it('starts content slides at the deepest level', async () => {
      expect(await masters(1)).toEqual([
        ['content', 'A', '<h2>B</h2><h3>C</h3><h4>D</h4><p>Text</p>'],
      ]);
      expect(await masters(2)).toEqual([
        ['title', 'A', ''],
        ['content', 'B', '<h3>C</h3><h4>D</h4><p>Text</p>'],
      ]);
    });

    it('starts section and subsection slides above the deepest level', async () => {
      expect(await masters(3)).toEqual([
        ['title', 'A', ''],
        ['section', 'B', ''],
        ['content', 'C', '<h4>D</h4><p>Text</p>'],
      ]);
      expect(await masters(4)).toEqual([
        ['title', 'A', ''],
        ['section', 'B', ''],
        ['subsection', 'C', ''],
        ['content', 'D', '<p>Text</p>'],
      ]);
    });

    it('detects the depth from the headings', async () => {
      expect(await masters(undefined)).toEqual(await masters(4));
      // At most 4, so that deeper headings stay in the slides.
      expect(await slides('# A\n\n##### B')).toEqual([
        { master: 'title', id: 'a', title: 'A', children: '<h5>B</h5>' },
      ]);
    });

    it('reports invalid depths', async () => {
      const file = await compile('---\ndepth: 5\n---\n\n# A', {
        ...sliderMdxOptions(),
      });
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Expected `depth` in the frontmatter'),
      ]);
    });
  });

  describe('table of contents', () => {
    it('nests slides by the levels of their headings', async () => {
      const module = await compileDeck(`Intro

# Talk

## Part

### One

---

More

### Two

## Other

---
`);
      expect(renderDeck(module).props).toMatchObject({
        toc: [
          { slide: 0 },
          {
            slide: 1,
            children: [
              {
                slide: 2,
                children: [{ slide: 3 }, { slide: 4 }, { slide: 5 }],
              },
              { slide: 6, children: [{ slide: 7 }] },
            ],
          },
        ],
      });
    });

    it('lists every slide with depth 0', async () => {
      const module = await compileDeck('---\ndepth: 0\n---\n\n# A\n\n---\n\nB');
      expect(renderDeck(module).props).toMatchObject({
        toc: [{ slide: 0 }, { slide: 1 }],
      });
    });

    it('takes titles from attribute blocks', async () => {
      const module = await compileDeck(
        '## Long title \\{title=Short}\n\n---\n\n\\{#more title="More results"}',
      );
      expect(renderDeck(module).props).toMatchObject({
        toc: [
          { slide: 0, title: 'Short' },
          { slide: 1, title: 'More results' },
        ],
      });
      // The slides keep their own titles.
      expect(
        (await slides('## Long title \\{title=Short}')).map(
          ({ title }) => title,
        ),
      ).toEqual(['Long title']);
    });

    it('can be overridden with props', async () => {
      const module = await compileDeck('## A');
      expect(renderDeck(module, { toc: [] }).props).toMatchObject({ toc: [] });
    });
  });

  describe('list steps', () => {
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

    it('applies attribute blocks', async () => {
      expect(
        await content(`
- One \\{with=initial}
- *Two* \\{step #two .wide data-x=y}
- Three \\{with=previous}
`),
      ).toEqual([
        '<ul>\n<Step component="li" with="initial">One</Step>\n' +
          '<Step component="li" id="two" className="wide" data-x="y">' +
          '<em>Two</em></Step>\n' +
          '<Step component="li" with="previous">Three</Step>\n</ul>',
      ]);
    });

    it('reads attribute blocks before nested lists', async () => {
      expect(
        await content(`
- One \\{step}
  - Nested \\{step}

- Loose \\{step}

  More \\{step}
`),
      ).toEqual([
        '<ul>\n<Step component="li">\n<p>One</p>\n<ul>\n' +
          '<Step component="li">Nested</Step>\n</ul>\n</Step>\n' +
          '<Step component="li">\n<p>Loose</p>\n<p>More {step}</p>\n</Step>\n</ul>',
      ]);
    });

    it('applies attribute blocks at the start of items', async () => {
      expect(
        await content(`
- \\{step} One
- \\{step .a} *Two* \\{.b data-x=y}
- \\{with=initial}
`),
      ).toEqual([
        '<ul>\n<Step component="li">One</Step>\n' +
          '<Step component="li" className="a b" data-x="y"><em>Two</em></Step>\n' +
          '<Step component="li" with="initial"></Step>\n</ul>',
      ]);
    });

    it('shares steps in groups', async () => {
      expect(
        await content(`
- \\{group=a} A1
- \\{group=b} B1
- \\{group=a} A2
- \\{group=b with=previous} B2
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

- \\{group=a} A
- \\{group=typo} B

<Step group="a">C</Step>

## Two

- \\{group=a} D
`,
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        '5:1-5:18: The step group `typo` is only used once on the slide',
        '11:1-11:15: The step group `a` is only used once on the slide',
      ]);
    });

    it('warns about with on groups that already exist', async () => {
      const file = await compile(
        `
- \\{group=a with=initial} A
- \\{group=b} B
- \\{group=a} C
- \\{group=b with=previous} D
  - \\{group=b} E \\{with=initial}
`,
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        '5:1-6:33: Ignoring `with=previous` on the step group `b`, which is placed by its first element',
        '6:3-6:33: Ignoring `with=initial` on the step group `b`, which is placed by its first element',
      ]);
    });

    it('keeps braces that are not attribute blocks', async () => {
      expect(await content('- Set \\{x}')).toEqual([
        '<ul>\n<Step component="li" with="previous">Set {x}</Step>\n</ul>',
      ]);
    });

    it('reports invalid steps', async () => {
      const file = await compile(
        '- A \\{with=next}\n- B \\{step with=initial}',
        {
          ...sliderMdxOptions(),
        },
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Expected `with=previous` or `with=initial`'),
        expect.stringContaining('Ignoring `with=initial`'),
      ]);
    });
  });

  describe('masters', () => {
    it('uses masters in the theme by name', async () => {
      expect(
        (
          await slides(
            '## A \\{master=section}\n\n## B \\{.closing}\n\n## C \\{.wide master=x}',
          )
        ).map(({ master }) => master),
      ).toEqual(['section', 'closing', 'x']);
    });

    it('uses components imported in the document', async () => {
      expect(
        (
          await slides(`
import { TwoColumn } from '${STUB_URL}';

## A \\{master=TwoColumn}

## B \\{.TwoColumn}
`)
        ).map(({ master }) => master),
      ).toEqual(['<TwoColumn>', 'TwoColumn']);
    });

    it('uses components declared in the document', async () => {
      expect(
        (
          await slides(`
export function Local() {
  return null;
}

---

\\{master=Local}
`)
        ).map(({ master }) => master),
      ).toEqual(['<Local>']);
    });
  });
});
