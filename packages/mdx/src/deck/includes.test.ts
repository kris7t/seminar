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
            title: 'Basics',
            children: [
              { slide: 2, title: 'Intro' },
              { slide: 3, title: 'Details' },
              { slide: 4, title: 'Intro' },
            ],
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
