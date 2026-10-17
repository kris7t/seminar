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
        children: '<Paragraph>Speaker</Paragraph>',
      },
      {
        master: 'content',
        id: 'introduction',
        title: 'Introduction',
        children: '<Paragraph>Body</Paragraph>',
      },
      { master: 'content', children: '<Paragraph>More</Paragraph>' },
    ]);
  });

  it('keeps content before the first slide break', async () => {
    expect(await slides('Intro\n\n## Next')).toEqual([
      { master: 'content', children: '<Paragraph>Intro</Paragraph>' },
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
        children: '<h3>Section</h3><Paragraph>Text</Paragraph>',
      },
    ]);
  });

  it('treats all thematic breaks as slide breaks', async () => {
    expect(await slides('One\n\n---\n\nTwo\n\n___\n\nThree')).toEqual([
      { master: 'content', children: '<Paragraph>One</Paragraph>' },
      { master: 'content', children: '<Paragraph>Two</Paragraph>' },
      { master: 'content', children: '<Paragraph>Three</Paragraph>' },
    ]);
  });

  it('starts slides with ::slide', async () => {
    expect(
      await slides(`
Intro

::slide{#end master=section}

Done

::slide[Title with *markup*]{master=closing}

::slide[Title with *markup*]
`),
    ).toEqual([
      { master: 'content', children: '<Paragraph>Intro</Paragraph>' },
      { master: 'section', id: 'end', children: '<Paragraph>Done</Paragraph>' },
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
        children: '<Paragraph>Done</Paragraph>',
      },
    ]);
  });

  it('reads attribute blocks at the end of headings', async () => {
    expect(
      await slides("## Results {#res master=section}\n\n## Total {'sum'}"),
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
        children: '<Paragraph>Text</Paragraph>',
      },
    ]);
  });

  it('passes props to the deck, with defaults from the frontmatter', async () => {
    const module = await compileDeck(`---
mouseNavigation: false
mirrorPointer: true
author: Someone
---

## Slide
`);
    expect(module.frontmatter).toEqual({
      title: 'Slide',
      mouseNavigation: false,
      mirrorPointer: true,
      author: 'Someone',
      depth: 2,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: false,
      defaultMirrorPointer: true,
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
      mirrorPointer: false,
      depth: 2,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: true,
      defaultMirrorPointer: false,
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
      defaultMirrorPointer: true,
    });
    const module = (await evaluate('# Slide', {
      ...runtime,
      ...options,
      baseUrl: import.meta.url,
    })) as Awaited<ReturnType<typeof compileDeck>>;
    expect(module.frontmatter).toEqual({
      title: 'Slide',
      mouseNavigation: false,
      mirrorPointer: true,
      theme: THEME_URL,
      depth: 1,
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: false,
      defaultMirrorPointer: true,
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

  describe('languages', () => {
    it('sets the language of the deck and its slides', async () => {
      const module = await compileDeck(
        '---\nlang: hu\n---\n\n## A\n\n## B {lang=en}',
      );
      const deck = renderDeck(module);
      expect(deck.props).toMatchObject({
        lang: 'hu',
        // And English, unless the deck lists its languages.
        uiLocales: [{ lang: 'hu' }, { lang: 'en' }],
      });
      expect(
        deck.props.children.map(
          (slide) => (slide as { props: { lang?: string } }).props.lang,
        ),
      ).toEqual([undefined, 'en']);
    });

    it('defaults to English', async () => {
      const deck = renderDeck(await compileDeck('## A'));
      expect(deck.props).toMatchObject({
        lang: 'en',
        uiLocales: [{ lang: 'en' }],
      });
    });

    it('imports the languages of the user interface', async () => {
      const code = String(
        await compile(
          '---\nlang: de-AT\nuiLanguages: [en, hu, { pt: ./pt.json }]\n---\n\n## A',
          sliderMdxOptions({ importSource: STUB_URL }),
        ),
      );
      expect(code).toContain('GERMAN as _SliderUiLocale0');
      expect(code).toContain('ENGLISH as _SliderUiLocale1');
      expect(code).toContain('HUNGARIAN as _SliderUiLocale2');
      expect(code).toContain('import _SliderUiLocale3 from "./pt.json"');
      expect(code).toContain('lang: "pt"');
      expect(code).not.toContain('FRENCH');
    });

    it('warns about languages without a user interface', async () => {
      const file = await compile(
        '---\nlang: ja\nuiLanguages: [xx]\n---\n\n## A',
        sliderMdxOptions({ importSource: STUB_URL }),
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining("isn't available in `ja`"),
        expect.stringContaining("isn't available in `xx`"),
      ]);
    });
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
          '<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><Paragraph>Text</Paragraph>',
        ],
      ]);
    });

    it('starts content slides at the deepest level', async () => {
      expect(await masters(1)).toEqual([
        [
          'content',
          'A',
          '<h2>B</h2><h3>C</h3><h4>D</h4><Paragraph>Text</Paragraph>',
        ],
      ]);
      expect(await masters(2)).toEqual([
        ['title', 'A', ''],
        ['content', 'B', '<h3>C</h3><h4>D</h4><Paragraph>Text</Paragraph>'],
      ]);
    });

    it('starts section and subsection slides above the deepest level', async () => {
      expect(await masters(3)).toEqual([
        ['title', 'A', ''],
        ['section', 'B', ''],
        ['content', 'C', '<h4>D</h4><Paragraph>Text</Paragraph>'],
      ]);
      expect(await masters(4)).toEqual([
        ['title', 'A', ''],
        ['section', 'B', ''],
        ['subsection', 'C', ''],
        ['content', 'D', '<Paragraph>Text</Paragraph>'],
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
    it('puts slides of headings deeper than the depth at the content level', async () => {
      const module = await compileDeck(
        '---\ndepth: 2\n---\n\n# Talk\n\n## A\n\n#### Deep :slide{section}\n\n## B',
      );
      expect(renderDeck(module).props).toMatchObject({
        toc: [
          { slide: 0, children: [{ slide: 1 }, { slide: 2 }, { slide: 3 }] },
        ],
      });
    });

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

  describe('fades', () => {
    it('passes cut as a prop rather than a master', async () => {
      expect(
        (await slides('## A {cut}\n\n## B {cut="in after" fade=300}')).map(
          ({ cut, fade, master }) => ({ cut, fade, master }),
        ),
      ).toEqual([
        { cut: '', fade: undefined, master: 'content' },
        { cut: 'in after', fade: '300', master: 'content' },
      ]);
    });
  });

  describe('spare slides', () => {
    it('marks slides as spare, along with the slides in spare divisions', async () => {
      expect(
        (
          await slides(`---
depth: 3
---

# Talk

## Main

### Point

## Backup {spare}

### Detail

---

More

### Kept {spare=false}

## Appendix :slide{spare=true}

::slide{spare}
`)
        ).map(({ title, spare }) => [title ?? '(untitled)', spare === true]),
      ).toEqual([
        ['Talk', false],
        ['Main', false],
        ['Point', false],
        ['Backup', true],
        ['Detail', true],
        ['(untitled)', true],
        ['Kept', false],
        ['Appendix', true],
        ['(untitled)', true],
      ]);
    });

    it('applies spare=false to the slides in the division', async () => {
      expect(
        (
          await slides(
            '# Backup {spare}\n\n## Main {spare=false}\n\n### Point\n\n## Other',
          )
        ).map(({ spare }) => spare === true),
      ).toEqual([true, false, false, true]);
    });

    it('is not a master', async () => {
      expect(
        (await slides('## A {section spare}')).map(({ master }) => master),
      ).toEqual(['section']);
    });

    it('reports invalid values', async () => {
      const file = await compile('## A {spare=maybe}', {
        ...sliderMdxOptions(),
      });
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Expected `spare` to be `true` or `false`'),
      ]);
    });
  });

  describe('divisions without slides', () => {
    it('only start divisions in the table of contents', async () => {
      const source = `---
depth: 3
---

# Talk {noslide}

## Main

### Point

## Backup {noslide spare}

Content right after the heading

### Detail
`;
      expect(
        (await slides(source)).map(({ title, spare }) => [
          title ?? '(untitled)',
          spare === true,
        ]),
      ).toEqual([
        ['Main', false],
        ['Point', false],
        ['(untitled)', true],
        ['Detail', true],
      ]);
      expect(renderDeck(await compileDeck(source)).props).toMatchObject({
        toc: [
          {
            title: 'Talk',
            children: [
              { slide: 0, children: [{ slide: 1 }] },
              { title: 'Backup', children: [{ slide: 2 }, { slide: 3 }] },
            ],
          },
        ],
      });
    });

    it('refer to the first slide that is not spare by their ids', async () => {
      expect(
        (
          await slides(`---
depth: 3
---

# Talk {noslide}

## Intro {spare}

## Main {#main-part noslide}

### Point

## Backup {noslide spare}

### Detail
`)
        ).map(({ id, aliases }) => [id, aliases]),
      ).toEqual([
        ['intro', undefined],
        ['point', ['talk', 'main-part']],
        ['detail', ['backup']],
      ]);
    });

    it('warn about masters, which they have no slide for', async () => {
      const file = await compile(
        '# Foo {subsection noslide}\n\n## Bar :slide{noslide master=X}\n\n### Baz',
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Ignoring the master `subsection`'),
        expect.stringContaining('Ignoring the master `X`'),
      ]);
    });

    it('are ignored on content slides and ::slide', async () => {
      const file = await compile(
        '## Section\n\n### Content {noslide}\n\n::slide{noslide}',
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Ignoring `noslide` on a heading of a content'),
        expect.stringContaining('Ignoring `noslide` on `::slide`'),
      ]);
    });
  });

  it('passes ranges of steps to the slide', async () => {
    expect(await slides('## A {after=1 to=parse.2}')).toEqual([
      {
        master: 'content',
        id: 'a',
        after: '1',
        to: 'parse.2',
        title: 'A',
        children: '',
      },
    ]);
    const file = await compile('## A {from=1.x}', { ...sliderMdxOptions() });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Expected `from` to be a step path'),
    ]);
  });

  describe('recaps', () => {
    it('recap slides by id', async () => {
      const source = `
## Intro {to=1}

::recap[#intro]{#again before=3 title=Again spare}

::recap[#intro]
`;
      expect(await slides(source)).toEqual([
        {
          master: 'content',
          id: 'intro',
          to: '1',
          title: 'Intro',
          children: '',
        },
        { recap: 'intro', spare: true, id: 'again', before: '3', children: '' },
        { recap: 'intro', children: '' },
      ]);
      expect(renderDeck(await compileDeck(source)).props).toMatchObject({
        toc: [{ slide: 0 }, { slide: 1, title: 'Again' }, { slide: 2 }],
      });
    });

    it('are spare by their own attributes and divisions', async () => {
      expect(
        (
          await slides(`
# Talk

## Intro {spare}

::recap[#intro]

# Backup {noslide spare}

::recap[#talk]
`)
        ).map(({ recap, spare }) => [recap ?? '', spare === true]),
      ).toEqual([
        ['', false],
        ['', true],
        ['intro', false],
        ['talk', true],
      ]);
    });

    it('reports attributes taken from the recapped slide', async () => {
      const file = await compile(
        '## Intro\n\n::recap[#intro]{.wide section steps=dim}\n\n::recap[intro]',
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining('Ignoring `.wide` on a recap'),
        expect.stringContaining('Ignoring `section` on a recap'),
        expect.stringContaining('Ignoring `steps` on a recap'),
        expect.stringContaining(
          'Expected `::recap` to refer to a slide by its id',
        ),
      ]);
    });
  });

  describe('masters', () => {
    it('uses masters in the theme by name', async () => {
      expect(
        (await slides('## A :slide{master=section}\n\n## B')).map(
          ({ master }) => master,
        ),
      ).toEqual(['section', 'content']);
    });

    it('passes classes to the master', async () => {
      expect(
        await slides('## A {.wide .dark master=section}\n\n::slide{.plain}'),
      ).toEqual([
        {
          master: 'section',
          id: 'a',
          className: 'wide dark',
          title: 'A',
          children: '',
        },
        { master: 'content', className: 'plain', children: '' },
      ]);
    });

    it('uses components imported in the document', async () => {
      expect(
        (
          await slides(`
import { TwoColumn } from '${STUB_URL}';

## A :slide{master=TwoColumn}

## B :slide{master=Other}
`)
        ).map(({ master }) => master),
      ).toEqual(['<TwoColumn>', 'Other']);
    });

    it('takes masters of the theme from bare words', async () => {
      expect(
        (
          await slides(`
import { TwoColumn } from '${STUB_URL}';

## A {section}

## B {TwoColumn .wide}

## C :slide{subsection master=closing}

::slide{section}
`)
        ).map(({ master, className }) => [master, className]),
      ).toEqual([
        ['section', undefined],
        // Imported masters need \`master=\`.
        ['TwoColumn', 'wide'],
        ['closing', undefined],
        ['section', undefined],
      ]);
    });

    it('warns about bare words that refer to the document', async () => {
      const file = await compile(
        'export const count = 3\n\n## Total {count}\n\n## Sum {String(count)}',
        { ...sliderMdxOptions() },
      );
      expect(file.messages.map(String)).toEqual([
        expect.stringContaining(
          'Write `master=count` to use that as the master, or `{String(count)}`',
        ),
      ]);
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
