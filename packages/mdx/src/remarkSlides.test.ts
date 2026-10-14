import { evaluate } from '@mdx-js/mdx';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from './options.ts';

type SlideSummary = Record<string, unknown>;

const STUB_URL = new URL('test-stub.ts', import.meta.url).href;

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
    const tag = typeof node.type === 'string' ? node.type : 'component';
    return `<${tag}>${text(node.props.children)}</${tag}>`;
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

  it('keeps other headings in the content', async () => {
    expect(await slides('## Slide\n\n### Section\n\nText')).toEqual([
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
    });
    expect(renderDeck(module).props).toMatchObject({
      defaultMouseNavigation: true,
    });
  });

  it('keeps the title in the frontmatter', async () => {
    const module = await compileDeck('---\ntitle: Talk\n---\n\n# Slide');
    expect(module.frontmatter).toMatchObject({ title: 'Talk' });
  });

  it('keeps exports of the document', async () => {
    const module = await compileDeck('export const answer = 42\n\n## Slide');
    expect((module as unknown as { answer: number }).answer).toBe(42);
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
