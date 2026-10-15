import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('directiveHandlers', () => {
  it('keeps colons that are not directives', async () => {
    expect(await slides('At 10:30, see a:b.')).toEqual([
      { master: 'content', children: '<p>At 10:30, see a:b.</p>' },
    ]);
  });

  it('reports unknown directives with attributes', async () => {
    const file = await compile('Some :typo{x=1} here\n\n::other', {
      ...sliderMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Unknown directive `:typo`'),
      expect.stringContaining('Unknown directive `::other`'),
    ]);
  });
});
