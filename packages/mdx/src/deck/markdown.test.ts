import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deckMarkdown } from './markdown.ts';

const FIXTURES = fileURLToPath(new URL('../test/fixtures/', import.meta.url));

/** Where the decks in the tests are, so that they include the fixtures. */
const HOST_PATH = path.join(FIXTURES, 'host.deck.mdx');

function markdown(source: string): string {
  return deckMarkdown(source, HOST_PATH);
}

describe('deckMarkdown', () => {
  it('changes the URLs of images next to the deck', () => {
    const imageUrl = (file: string) => `#${path.relative(FIXTURES, file)}`;
    expect(
      deckMarkdown(
        '## Images\n\n![A diagram](./diagram.svg "Title"){#diagram}\n\n![Remote](https://example.com/a.png) ![Spaced](<my image.png>)\n\n![Referenced][ref]\n\n[ref]: ./sub/ref.png\n[link]: ./other.png\n',
        HOST_PATH,
        { imageUrl },
      ),
    ).toBe(
      '## Images\n\n![A diagram](#diagram.svg "Title"){#diagram}\n\n![Remote](https://example.com/a.png) ![Spaced](#my image.png)\n\n![Referenced][ref]\n\n[ref]: #sub/ref.png\n[link]: ./other.png\n',
    );
  });

  it('changes the URLs of images next to the deck of included slides', () => {
    expect(
      deckMarkdown(
        '## Host\n\n::include[./images.deck.mdx#picture]\n',
        HOST_PATH,
        { imageUrl: (file) => `#${path.relative(FIXTURES, file)}` },
      ),
    ).toBe(
      '## Host\n\n## Picture {#picture}\n\n![A picture](#assets/picture.png)\n',
    );
  });

  it('removes MDX comments', () => {
    expect(
      markdown(
        '## Title {#title}\n\n{/* A note */}\n\nText {/* inline */} more.\n\n{/*\n  Lines\n*/}\n\n- Item\n',
      ),
    ).toBe('## Title {#title}\n\nText more.\n\n- Item\n');
  });

  it('removes imports and the frontmatter of the presentation', () => {
    expect(
      markdown(
        "---\ntitle: Talk\nlang: hu # Hungarian\ndepth: 2\nmath:\n  macros:\n    R: '\\\\mathbb{R}'\nmouseNavigation: false\n---\n\nimport { Step } from '@seminar/core';\n\nexport const answer = 42;\n\n## Title\n\n<Step>Text</Step>\n",
      ),
    ).toBe(
      "---\ntitle: Talk\nlang: hu # Hungarian\ndepth: 2\nmath:\n  macros:\n    R: '\\\\mathbb{R}'\n---\n\nexport const answer = 42;\n\n## Title\n\n<Step>Text</Step>\n",
    );
    expect(
      markdown(
        "---\ntheme: ./theme.tsx\n---\n\nimport { Step } from '@seminar/core';\n\n## Title\n",
      ),
    ).toBe('## Title\n');
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
