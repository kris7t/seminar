import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

import { compile, compileSync, evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import {
  renderSlideExport,
  STUB_URL,
  text,
  type SlideSummary,
} from '../test/compileDeck.ts';
import type { ReactElement, ReactNode } from 'react';

const OPTIONS = { importSource: STUB_URL, math: false } as const;

const FIXTURES = new URL('../test/fixtures/', import.meta.url);

/** Where the decks in the tests are, so that they include the fixtures. */
const HOST_PATH = fileURLToPath(new URL('host.deck.mdx', FIXTURES));

// Compiles the included decks when the compiled decks import them.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.deck.mdx')) {
      return nextLoad(url, context);
    }
    const filePath = fileURLToPath(url);
    const code = compileSync(
      { value: readFileSync(filePath, 'utf8'), path: filePath },
      sliderMdxOptions(OPTIONS),
    );
    return { format: 'module', source: String(code), shortCircuit: true };
  },
});

async function compileHost(source: string) {
  return (await evaluate(
    { value: source, path: HOST_PATH },
    { ...runtime, ...sliderMdxOptions(OPTIONS), baseUrl: FIXTURES },
  )) as { default: (props: object) => ReactNode };
}

/** Summarizes the slides of the deck, like `slides` of `compileDeck`. */
async function includedSlides(source: string): Promise<SlideSummary[]> {
  const module = await compileHost(source);
  const deck = module.default({}) as ReactElement<{ children: ReactNode }>;
  return [deck.props.children].flat().map((child) => {
    const slide = renderSlideExport(child) as ReactElement<
      Record<string, unknown>
    >;
    const { children, title, ...rest } = slide.props;
    // The components of the document are passed to the slide, too.
    const props = Object.fromEntries(
      Object.entries(rest).filter(([key]) => key !== 'components'),
    );
    return {
      ...props,
      ...(title === undefined ? {} : { title: text(title as ReactNode) }),
      ...(children === undefined
        ? {}
        : { children: text(children as ReactNode) }),
    };
  });
}

async function tocOf(source: string) {
  const module = await compileHost(source);
  return (module.default({}) as ReactElement<{ toc: unknown }>).props.toc;
}

async function messages(source: string) {
  const file = await compile(
    { value: source, path: HOST_PATH },
    sliderMdxOptions(OPTIONS),
  );
  return file.messages.map(String);
}

describe('::include', () => {
  it('includes a slide by its id', async () => {
    expect(
      await includedSlides(
        '## Mine\n\n::include[./talk.deck.mdx#details]{#d title=Short spare to=1}',
      ),
    ).toEqual([
      { master: 'content', id: 'mine', title: 'Mine' },
      {
        master: 'content',
        id: 'd',
        spare: true,
        to: '1',
        title: 'Details',
        children: '<p>Text</p>',
      },
    ]);
    expect(
      await tocOf('## Mine\n\n::include[./talk.deck.mdx#details]{title=Short}'),
    ).toEqual([{ slide: 0 }, { slide: 1, title: 'Short' }]);
  });

  it('includes a recap as the slide with the range it would have', async () => {
    const [slide] = await includedSlides(
      '::include[./talk.deck.mdx#intro-recap]',
    );
    expect(slide).toMatchObject({
      id: 'intro-recap',
      after: '1',
      title: 'Intro',
    });
    expect(slide?.['to']).toBeUndefined();
  });

  it('includes divisions with their slides and recaps', async () => {
    const slides = await includedSlides(
      '---\ndepth: 4\n---\n\n# Mine\n\n## Part\n\n::include[./talk.deck.mdx#basics]{spare}',
    );
    expect(
      slides.map(({ id, title, recap, spare, to }) => ({
        id,
        title,
        recap,
        spare,
        to,
      })),
    ).toEqual([
      { id: 'mine', title: 'Mine' },
      { id: 'part', title: 'Part' },
      { id: 'basics', title: 'Basics', spare: true },
      { id: 'intro', title: 'Intro', spare: true, to: '1' },
      { id: 'details', title: 'Details', spare: true },
      { id: 'intro-recap', recap: 'intro', spare: true },
    ]);
    expect(
      await tocOf(
        '---\ndepth: 3\n---\n\n# Mine\n\n::include[./talk.deck.mdx#basics]',
      ),
    ).toEqual([
      {
        slide: 0,
        children: [
          {
            slide: 1,
            children: [{ slide: 2 }, { slide: 3 }, { slide: 4 }],
          },
        ],
      },
    ]);
  });

  it('includes divisions without slides', async () => {
    const source =
      '---\ndepth: 3\n---\n\n# Mine\n\n::include[./talk.deck.mdx#backup]';
    expect(
      (await includedSlides(source)).map(({ id, spare, aliases }) => [
        id,
        spare,
        aliases,
      ]),
    ).toEqual([
      ['mine', undefined, undefined],
      // Spare like a division of this deck, and the target of its id.
      ['extra', undefined, ['backup']],
    ]);
    expect(await tocOf(source)).toEqual([
      {
        slide: 0,
        children: [{ title: 'Backup', children: [{ slide: 1 }] }],
      },
    ]);
    expect(
      (await includedSlides(`${source}{spare}`)).map(({ spare }) => spare),
    ).toEqual([undefined, true]);
  });

  it('keeps the levels of divisions', async () => {
    // A section stays a section, even after a subsection.
    expect(
      await tocOf(
        '---\ndepth: 4\n---\n\n# Mine\n\n## Part\n\n### Sub\n\n::include[./talk.deck.mdx#basics]',
      ),
    ).toEqual([
      {
        slide: 0,
        children: [
          { slide: 1, children: [{ slide: 2 }] },
          {
            slide: 3,
            children: [{ slide: 4 }, { slide: 5 }, { slide: 6 }],
          },
        ],
      },
    ]);
  });

  it('keeps content slides and divisions, whatever the depths', async () => {
    // The included deck has a depth of 3.
    expect(
      await tocOf(
        '---\ndepth: 2\n---\n\n# Mine\n\n::include[./talk.deck.mdx#details]\n\n::include[./talk.deck.mdx#basics]',
      ),
    ).toEqual([
      {
        slide: 0,
        children: [
          { slide: 1 },
          // The section stays a section, although the deck has no sections.
          {
            slide: 2,
            children: [{ slide: 3 }, { slide: 4 }, { slide: 5 }],
          },
        ],
      },
    ]);
    expect(
      await tocOf(
        '---\ndepth: 4\n---\n\n# A\n\n## B\n\n### C\n\n::include[./talk.deck.mdx#details]',
      ),
    ).toEqual([
      {
        slide: 0,
        children: [
          {
            slide: 1,
            children: [{ slide: 2, children: [{ slide: 3 }] }],
          },
        ],
      },
    ]);
  });

  it('includes ranges of slides, and recaps slides outside them', async () => {
    const slides = await includedSlides(
      '---\ndepth: 3\n---\n\n::include[./talk.deck.mdx]{after=intro to=backup}',
    );
    expect(
      slides.map(({ id, title, recap, spare, after }) => ({
        id,
        title,
        recap,
        spare,
        after,
      })),
    ).toEqual([
      { id: 'details', title: 'Details' },
      // The recap of a slide outside the range shows the slide.
      { id: 'intro-recap', title: 'Intro', after: '1' },
      { id: 'extra', title: 'Extra', spare: true },
    ]);
  });

  it('includes whole decks, and makes ids unique', async () => {
    const slides = await includedSlides(
      '## Details\n\n::include[./talk.deck.mdx]',
    );
    expect(slides.map(({ id }) => id)).toEqual([
      'details',
      'talk',
      'basics',
      'intro',
      'details-1',
      'intro-recap',
      'extra',
    ]);
  });

  describe('of slides included before', () => {
    /** Summarizes the slides by their ids and what they recap. */
    async function summary(source: string) {
      return (await includedSlides(source)).map(({ id, recap, title }) =>
        recap === undefined ? [id, title] : [id, `recap of ${recap as string}`],
      );
    }

    it('recaps them', async () => {
      expect(
        await summary(
          '::include[./talk.deck.mdx#details]\n\n::include[./talk.deck.mdx#details]{to=1}',
        ),
      ).toEqual([
        ['details', 'Details'],
        [undefined, 'recap of details'],
      ]);
    });

    it('recaps them in overlapping ranges', async () => {
      expect(
        await summary(
          '::include[./talk.deck.mdx#basics]\n\n::include[./talk.deck.mdx]{from=details to=details}',
        ),
      ).toEqual([
        ['basics', 'Basics'],
        ['intro', 'Intro'],
        ['details', 'Details'],
        ['intro-recap', 'recap of intro'],
        [undefined, 'recap of details'],
      ]);
    });

    it('recaps them for recaps of them', async () => {
      const slides = await includedSlides(
        '::include[./talk.deck.mdx#intro]\n\n::include[./talk.deck.mdx]{after=intro to=basics}',
      );
      expect(slides.map(({ id, recap, after }) => [id, recap, after])).toEqual([
        ['intro', undefined, undefined],
        ['details', undefined, undefined],
        // Continues where the previous showing ended, like other recaps.
        ['intro-recap', 'intro', undefined],
      ]);
    });

    it('recaps them when included by other decks', async () => {
      expect(
        await summary(
          '::include[./talk.deck.mdx#details]\n\n::include[./other.deck.mdx]',
        ),
      ).toEqual([
        ['details', 'Details'],
        // Titles keep their markup.
        ['wrapper', '<em>Wrapper</em>'],
        [undefined, 'recap of details'],
      ]);
    });

    it('copies them with copy', async () => {
      expect(
        await summary(
          '::include[./talk.deck.mdx#details]\n\n::include[./talk.deck.mdx#details]{copy}\n\n::include[./talk.deck.mdx#details]',
        ),
      ).toEqual([
        ['details', 'Details'],
        ['details-1', 'Details'],
        [undefined, 'recap of details'],
      ]);
    });
  });

  describe('of this deck', () => {
    it('recaps slides, repeating their ranges', async () => {
      const slides = await includedSlides(
        '## A {to=1}\n\n- :step a\n- :step b\n\n## B\n\n::include[#a]\n\n::include[.#a]{#again after=1}',
      );
      expect(
        slides.map(({ id, recap, from, after, to }) => [
          id,
          recap,
          from,
          after,
          to,
        ]),
      ).toEqual([
        ['a', undefined, undefined, undefined, '1'],
        ['b', undefined, undefined, undefined, undefined],
        // Starts from the beginning, unlike `::recap`.
        [undefined, 'a', '0', undefined, '1'],
        ['again', 'a', undefined, '1', '1'],
      ]);
    });

    it('copies slides with copy', async () => {
      const slides = await includedSlides(
        '## A\n\nText\n\n::recap[#a]\n\n## C\n\n::include[.]{from=a before=c copy}',
      );
      expect(
        slides.map(({ id, recap, title, children }) => [
          id,
          recap ?? title,
          children,
        ]),
      ).toEqual([
        ['a', 'A', '<p>Text</p>'],
        [undefined, 'a', undefined],
        ['c', 'C', undefined],
        ['a-1', 'A', '<p>Text</p>'],
        // Recaps the copy.
        [undefined, 'a-1', undefined],
      ]);
    });

    it('includes divisions, also later in the deck', async () => {
      const source =
        '---\ndepth: 3\n---\n\n# Talk\n\n::include[#part]\n\n## Part\n\n### X';
      expect(
        (await includedSlides(source)).map(({ id, recap }) => [id, recap]),
      ).toEqual([
        ['talk', undefined],
        [undefined, 'part'],
        [undefined, 'x'],
        ['part', undefined],
        ['x', undefined],
      ]);
      expect(await tocOf(source)).toEqual([
        {
          slide: 0,
          children: [
            { slide: 1, children: [{ slide: 2 }] },
            { slide: 3, children: [{ slide: 4 }] },
          ],
        },
      ]);
    });

    it('reports ranges that contain the include', async () => {
      expect(
        await messages('## A\n\n::include[.]\n\n::include[#missing]'),
      ).toEqual([
        expect.stringContaining('contain the `::include` itself'),
        expect.stringContaining("Can't find the slide `missing` in this deck"),
      ]);
    });
  });

  it('reports mistakes', async () => {
    expect(
      await messages(`
::include[./missing.deck.mdx#a]

::include[./talk.deck.mdx#nothing]

::include[./talk.deck.mdx#basics]{to=1 .wide}

::include[./talk.deck.mdx#details]{master=x}
`),
    ).toEqual([
      expect.stringContaining("Can't include `./missing.deck.mdx`"),
      expect.stringContaining("Can't find the slide `nothing`"),
      expect.stringContaining('Ignoring `.wide` on `::include` of a division'),
      expect.stringContaining('Ignoring `to` on `::include` of a division'),
      expect.stringContaining('Ignoring `master` on `::include` of a slide'),
    ]);
  });
});
