import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { rewriteHeadingAttributes } from '../directives/remarkHeadingAttributes.ts';
import { sliderMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

const ARCH = 'https://example.com/arch.svg';

describe('images', () => {
  async function content(source: string): Promise<unknown> {
    return (await slides(source)).map(({ children }) => children);
  }

  it('turns images on their own lines into blocks', async () => {
    expect(
      await content(`
## Slide

![Architecture](${ARCH} "The parts"){#arch .wide width=600 step}

:step{only} ![Detail](${ARCH})

![](${ARCH} "Only a caption")
`),
    ).toEqual([
      `<Image src="${ARCH}" alt="Architecture" caption="The parts" block=true id="arch" className="wide" width="600" step=""></Image>` +
        `<Image src="${ARCH}" alt="Detail" block=true step=true only=""></Image>` +
        `<Image src="${ARCH}" caption="Only a caption" block=true></Image>`,
    ]);
  });

  it('keeps images in the text inline', async () => {
    expect(
      await content(`
## Slide

See ![icon](${ARCH}){.small} here, and ![ref][logo]

[logo]: ${ARCH} "Logo"
`),
    ).toEqual([
      `<Paragraph>See <Image src="${ARCH}" alt="icon" className="small"></Image> here, and ` +
        `<Image src="${ARCH}" alt="ref" title="Logo"></Image></Paragraph>`,
    ]);
  });

  it('keeps images in notes plain', async () => {
    expect(
      (
        await slides(`
## Slide

:::notes
![Hint](${ARCH})
:::
`)
      ).map(({ notes }) => notes),
      // The summary leaves out the attributes of HTML elements.
    ).toEqual(['<img></img>']);
  });

  it('imports images next to the deck', async () => {
    const file = await compile(
      '## Slide\n\n![A](./a%20b.svg)\n\n![B](./a%20b.svg)',
      {
        ...sliderMdxOptions(),
      },
    );
    const code = String(file);
    expect(code).toContain('import _SliderImage0 from "./a b.svg";');
    expect(code.match(/src: _SliderImage0/g)).toHaveLength(2);
  });

  it('rewrites attribute blocks after images outside of code', () => {
    expect(
      rewriteHeadingAttributes(
        'A ![x](y){#a} `![x](y){#b}` ![x][r]{.c} ![x](y) {#d}\n',
      ),
    ).toBe(
      'A ![x](y):slider-attributes{#a} `![x](y){#b}` ![x][r]:slider-attributes{.c} ![x](y) {#d}\n',
    );
  });
});
