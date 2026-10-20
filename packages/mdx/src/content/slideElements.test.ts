import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { seminarMdxOptions } from '../options.ts';
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
        '<ul>\n<ListItem step=true id="parse">Parse</ListItem>\n</ul>',
    ]);
  });

  it('refers to the elements of the slide in attributes', async () => {
    expect(
      (
        await slides(`
## One

<svg aria-labelledby="label other">
  <title id="label">Boxes</title>
  <defs><linearGradient id="fade" /><rect id="box" /></defs>
  <rect fill="url(#fade)" stroke="url('#other')" />
  <use href="#box" />
  <a href="#intro">Elsewhere</a>
</svg>
`)
      ).map(({ children }) => children),
    ).toEqual([
      '<SlideElement as="svg" references={"aria-labelledby":[["label"]," other"]}>' +
        '<SlideElement as="title" name="label">Boxes</SlideElement>' +
        '<defs><SlideElement as="linearGradient" name="fade"></SlideElement>' +
        '<SlideElement as="rect" name="box"></SlideElement></defs>' +
        '<SlideElement as="rect" references={"fill":["url(#",["fade"],")"]} stroke="url(\'#other\')"></SlideElement>' +
        '<SlideElement as="use" references={"href":["#",["box"]]}></SlideElement>' +
        '<a>Elsewhere</a></SlideElement>',
    ]);
  });

  it('finds the names in the url references of styles', async () => {
    expect(
      (
        await slides(`
## One

export const active = true;

<svg>
  <linearGradient id="on" />
  <linearGradient id="off" />
  <rect style={{ fill: "url('#on')" }} />
  <rect style={{ fill: \`url(#\${active ? 'on' : 'off'})\` }} />
  <rect style={{ fill: 'url(#elsewhere)' }} />
</svg>
`)
      ).map(({ children }) => children),
    ).toEqual([
      '<svg><SlideElement as="linearGradient" name="on"></SlideElement>' +
        '<SlideElement as="linearGradient" name="off"></SlideElement>' +
        '<SlideElement as="rect" styleNames=["on"] style={"fill":"url(\'#on\')"}></SlideElement>' +
        '<SlideElement as="rect" styleNames=["on","off"] style={"fill":"url(#on)"}></SlideElement>' +
        '<rect></rect></svg>',
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
      { ...seminarMdxOptions() },
    );
    expect(file.messages.map(String)).toEqual([
      '7:1-7:22: The id `a` is used more than once on the slide',
    ]);
  });
});
