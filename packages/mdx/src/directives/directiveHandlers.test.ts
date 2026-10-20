import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { seminarMdxOptions } from '../options.ts';
import { slides } from '../test/compileDeck.ts';

describe('directiveHandlers', () => {
  it('keeps colons that are not directives', async () => {
    expect(await slides('At 10:30, see a:b.')).toEqual([
      {
        master: 'content',
        children: '<Paragraph>At 10:30, see a:b.</Paragraph>',
      },
    ]);
  });

  it('reports unknown directives with attributes', async () => {
    const file = await compile('Some :typo{x=1} here\n\n::other', {
      ...seminarMdxOptions(),
    });
    expect(file.messages.map(String)).toEqual([
      expect.stringContaining('Unknown directive `:typo`'),
      expect.stringContaining('Unknown directive `::other`'),
    ]);
  });
});
