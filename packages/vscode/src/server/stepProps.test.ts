import { deckSyntaxPlugins } from '@seminar/mdx/syntax';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { findBareProps } from './stepProps.ts';

/** Returns the words that were found, checking their offsets. */
function find(source: string): string[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins([]))
    .parse(source);
  return findBareProps(source, tree).map(({ word, offset, slide }) => {
    expect(source.slice(offset, offset + word.length)).toBe(word);
    return slide ? `slide:${word}` : word;
  });
}

describe('findBareProps', () => {
  it('finds the bare words of directives of every form', () => {
    expect(
      find(`::Box{fancy a=1 .b #c}

:::Foo{only title="not this"}
Text :step{swap} and :Bar{dim}.
:::
`),
    ).toEqual(['fancy', 'only', 'swap', 'dim']);
  });

  it('skips labels of directives', () => {
    expect(find('::Box[a [nested] {not} \\] label]{fancy}\n')).toEqual([
      'fancy',
    ]);
  });

  it('finds the bare words of images', () => {
    expect(find('![alt](image.png){only #id}\n')).toEqual(['only']);
  });

  it('finds the bare words of slides', () => {
    expect(find('# Title {#id wide spare}\n\n::slide{section}\n')).toEqual([
      'slide:wide',
      'slide:spare',
      'slide:section',
    ]);
  });

  it('leaves out directives that are not components', () => {
    expect(
      find(`::include{./other.deck.mdx}

::recap{other}

:::notes{other}
Text
:::
`),
    ).toEqual([]);
  });

  it('finds the bare words of code blocks', () => {
    expect(
      find(`\`\`\`js only {1-3} a=b
only
\`\`\`
`),
    ).toEqual(['only']);
  });

  it('finds code blocks in other blocks', () => {
    expect(
      find(`> \`\`\`js only
> x
> \`\`\`
`),
    ).toEqual(['only']);
  });

  it('finds the bare words of steps in diagrams', () => {
    expect(
      find(`\`\`\`mermaid swap
flowchart LR
  %% step
  A --> B
  %% step only group=x
  B --> C
  %% step[A, A->B] dim
  %% only
\`\`\`
`),
    ).toEqual(['swap', 'only', 'dim']);
  });

  it('leaves out comments that look like steps in other code', () => {
    expect(
      find(`\`\`\`tex
%% step only
\`\`\`
`),
    ).toEqual([]);
  });

  it('leaves out code spans', () => {
    expect(find('Write `:step{only}` here.\n')).toEqual([]);
  });
});
