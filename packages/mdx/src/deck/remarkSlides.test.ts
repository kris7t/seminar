import { compile, evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import {
  compileDeck,
  renderDeck,
  slides,
  STUB_URL,
  THEME_URL,
} from '../test/compileDeck.ts';

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

  it('starts slides with ::slide', async () => {
    expect(
      await slides(`
Intro

::slide{#end master=section}

Done

::slide[Title with *markup*]{.closing}

::slide[Title with *markup*]
`),
    ).toEqual([
      { master: 'content', children: '<p>Intro</p>' },
      { master: 'section', id: 'end', children: '<p>Done</p>' },
      {
        master: 'closing',
        id: 'title-with-markup',
        title: 'Title with <em>markup</em>',
        children: '',
      },
      {
        master: 'content',
        id: 'title-with-markup-1',
        title: 'Title with <em>markup</em>',
        children: '',
      },
    ]);
  });

  it('makes slide ids unique', async () => {
    expect((await slides('## Intro\n\n## Intro')).map(({ id }) => id)).toEqual([
      'intro',
      'intro-1',
    ]);
  });

  it('applies attributes of :slide in headings', async () => {
    expect(
      await slides(`
## Results :slide{#res master=section note="a b"}

Done
`),
    ).toEqual([
      {
        master: 'section',
        id: 'res',
        note: 'a b',
        title: 'Results',
        children: '<p>Done</p>',
      },
    ]);
  });

  it('reads attribute blocks at the end of headings', async () => {
    expect(
      await slides("## Results {#res .section}\n\n## Total {'sum'}"),
    ).toEqual([
      { master: 'section', id: 'res', title: 'Results', children: '' },
      { master: 'content', id: 'total-sum', title: 'Total sum', children: '' },
    ]);
  });

  it('starts slides at deeper headings with :slide', async () => {
    expect(
      await slides(
        '---\ndepth: 2\n---\n\n## Slide\n\n### Section\n\n#### Deeper :slide\n\nText',
      ),
    ).toEqual([
      {
        master: 'content',
        id: 'slide',
        title: 'Slide',
        children: '<h3>Section</h3>',
      },
      {
        master: 'content',
        id: 'deeper',
        title: 'Deeper',
        children: '<p>Text</p>',
      },
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
      'Intro\n\n## First :slide{#first}\n\n# Second',
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

    it('takes titles from attributes', async () => {
      const module = await compileDeck(
        '## Long title :slide{title=Short}\n\n::slide{#more title="More results"}',
      );
      expect(renderDeck(module).props).toMatchObject({
        toc: [
          { slide: 0, title: 'Short' },
          { slide: 1, title: 'More results' },
        ],
      });
      // The slides keep their own titles.
      expect(
        (await slides('## Long title :slide{title=Short}')).map(
          ({ title }) => title,
        ),
      ).toEqual(['Long title']);
    });

    it('can be overridden with props', async () => {
      const module = await compileDeck('## A');
      expect(renderDeck(module, { toc: [] }).props).toMatchObject({ toc: [] });
    });
  });

  describe('masters', () => {
    it('uses masters in the theme by name', async () => {
      expect(
        (
          await slides(
            '## A :slide{master=section}\n\n## B :slide{.closing}\n\n## C :slide{.wide master=x}',
          )
        ).map(({ master }) => master),
      ).toEqual(['section', 'closing', 'x']);
    });

    it('uses components imported in the document', async () => {
      expect(
        (
          await slides(`
import { TwoColumn } from '${STUB_URL}';

## A :slide{master=TwoColumn}

## B :slide{.TwoColumn}
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

::slide{master=Local}
`)
        ).map(({ master }) => master),
      ).toEqual(['<Local>']);
    });
  });
});
