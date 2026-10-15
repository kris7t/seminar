import { describe, expect, it } from 'vitest';

import { rewriteHeadingAttributes } from './remarkHeadingAttributes.ts';

describe('rewriteHeadingAttributes', () => {
  it('turns attribute blocks at the end of headings into :slide', () => {
    expect(
      rewriteHeadingAttributes(
        '## Title {#id .section key="a b"}\n# {#only}\n### Closed {.x} ##\r\n',
      ),
    ).toBe(
      '## Title :slide{#id .section key="a b"}\n# :slide{#only}\n### Closed :slide{.x} ##\r\n',
    );
  });

  it('leaves expressions and other text alone', () => {
    const source =
      '## Total {count}\n## Sum {a + b}\nText {#id}\n    ## Code {#id}\n';
    expect(rewriteHeadingAttributes(source)).toBe(source);
  });

  it('skips fenced code and the frontmatter', () => {
    const source =
      '---\n# comment {#x}\n---\n\n```md\n## Code {#id}\n```\n\n## After {#a}\n';
    expect(rewriteHeadingAttributes(source)).toBe(
      source.replace('## After {#a}', '## After :slide{#a}'),
    );
  });
});
