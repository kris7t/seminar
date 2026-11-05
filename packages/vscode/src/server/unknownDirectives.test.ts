import { deckSyntaxPlugins } from '@seminar/mdx/syntax';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { findUnknownDirectives } from './unknownDirectives.ts';

function find(source: string) {
  const root = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins([]))
    .parse(source);
  return findUnknownDirectives(source, root, {
    callout: { source: '@seminar/elements', exportName: 'Callout' },
  }).map(({ start, end, message }) => [source.slice(start, end), message]);
}

describe('findUnknownDirectives', () => {
  it('finds the directives that nothing handles', () => {
    expect(
      find(`# Title {#intro}

:::callout
At 10:30, :step and :kbd[Ctrl] or :foo{x=1}.
:::

::embed

:::aside
Text
:::
`),
    ).toEqual([
      [
        'kbd',
        'Unknown directive `:kbd`, keeping it as text; write `\\:` for a literal colon',
      ],
      [
        'foo',
        'Unknown directive `:foo`, keeping it as text; write `\\:` for a literal colon',
      ],
      [
        'embed',
        'Unknown directive `::embed`, keeping it as text; write `\\:` for a literal colon',
      ],
      ['aside', 'Ignoring the unknown directive `:::aside`'],
    ]);
  });

  it('leaves images with attributes alone', () => {
    expect(find('![Image](a.svg){width=600}\n')).toEqual([]);
  });
});
