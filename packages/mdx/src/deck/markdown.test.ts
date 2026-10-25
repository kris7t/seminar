import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deckMarkdown } from './markdown.ts';

/** Where the decks in the tests are, so that they include the fixtures. */
const HOST_PATH = fileURLToPath(
  new URL('../test/fixtures/host.deck.mdx', import.meta.url),
);

function markdown(source: string): string {
  return deckMarkdown(source, HOST_PATH);
}

describe('deckMarkdown', () => {
  it('removes MDX comments', () => {
    expect(
      markdown(
        '## Title {#title}\n\n{/* A note */}\n\nText {/* inline */} more.\n\n{/*\n  Lines\n*/}\n\n- Item\n',
      ),
    ).toBe('## Title {#title}\n\nText more.\n\n- Item\n');
  });

  it('keeps comments in code', () => {
    const source = '## Code\n\n```js\n{/* kept */}\n```\n';
    expect(markdown(source)).toBe(source);
  });

  it('keeps expressions that are not only comments', () => {
    const source = '## Total\n\n{/* count */ 1 + 1}\n';
    expect(markdown(source)).toBe(source);
  });

  it('includes slides from other decks', () => {
    expect(
      markdown(
        '---\ndepth: 2\n---\n\n## Before\n\n::include[./talk.deck.mdx#details]\n\n## After\n',
      ),
    ).toBe(
      '---\ndepth: 2\n---\n\n## Before\n\n## Details\n\nText\n\n:::notes\nSay _more_\n:::\n\n## After\n',
    );
  });

  it('includes divisions with their slides, recaps, and divisions without slides', () => {
    expect(
      markdown(
        '---\ndepth: 3\n---\n\n::include[./talk.deck.mdx]{from=basics}\n',
      ),
    ).toBe(
      [
        '---\ndepth: 3\n---',
        '## Basics',
        '### Intro {to=1}\n\n- :step a\n- :step b',
        '### Details\n\nText\n\n:::notes\nSay _more_\n:::',
        '::recap[#intro]',
        '## Backup {noslide}',
        '### Extra\n\nSpare text',
      ].join('\n\n') + '\n',
    );
  });

  it('includes slides that the other deck includes', () => {
    expect(markdown('## Host\n\n::include[./other.deck.mdx]\n')).toBe(
      '## Host\n\n## _Wrapper_\n\n## Details\n\nText\n\n:::notes\nSay _more_\n:::\n',
    );
  });

  it('starts a slide for content after the included slides', () => {
    expect(
      markdown('## Host\n\n::include[./talk.deck.mdx#details]\n\nMore text\n'),
    ).toBe(
      '## Host\n\n## Details\n\nText\n\n:::notes\nSay _more_\n:::\n\n---\n\nMore text\n',
    );
  });

  it('keeps includes of the deck itself and includes that fail', () => {
    const source =
      '## Host {#host}\n\n::include[#host]\n\n::include[./missing.deck.mdx]\n';
    expect(markdown(source)).toBe(source);
  });
});
