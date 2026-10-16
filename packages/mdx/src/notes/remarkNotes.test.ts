import { compile } from '@mdx-js/mdx';
import type { Nodes, Root } from 'mdast';
import type {} from 'mdast-util-directive';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('remarkNotes', () => {
  it('adds notes to the slide', async () => {
    expect(
      await slides(`
## Slide

Text

:::notes
Say *this*
:::
`),
    ).toEqual([
      {
        master: 'content',
        id: 'slide',
        title: 'Slide',
        children:
          '<Paragraph>Text</Paragraph><Notes><p>Say <em>this</em></p></Notes>',
      },
    ]);
  });

  it('reports notes inside other content', async () => {
    const file = await compile('## A\n\n> :::notes\n> B\n> :::', {
      ...sliderMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Expected `:::notes` at the top level'),
    ]);
  });

  it('leaves other directives to other plugins', async () => {
    const file = await compile(':::other\nText\n:::', {
      ...sliderMdxOptions(),
      remarkPlugins: [
        ...(sliderMdxOptions().remarkPlugins ?? []),
        () => (tree: Root) => {
          const visit = (node: Nodes) => {
            if (node.type === 'containerDirective') {
              node.data = { hName: 'aside' };
            }
            if ('children' in node) {
              node.children.forEach(visit);
            }
          };
          visit(tree);
        },
      ],
    });
    expect(file.messages).toEqual([]);
    expect(String(file)).toContain('"aside"');
  });
});
