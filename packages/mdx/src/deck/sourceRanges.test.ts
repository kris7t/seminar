import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { seminarMdxOptions } from '../options.ts';

const STUB = 'stub-core';

async function compiled(source: string, options: object = {}): Promise<string> {
  return String(
    await compile(source, {
      ...seminarMdxOptions({
        importSource: STUB,
        sourcePositions: true,
        directives: { Box: { source: 'stub-box', exportName: 'Box' } },
        ...options,
      }),
    }),
  );
}

/** Returns the ranges that the deck tells, in order. */
function ranges(code: string): string[] {
  return [...code.matchAll(/"(\d+:\d+-\d+:\d+)"/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('source ranges', () => {
  it('leaves decks as they are unless asked to', async () => {
    const code = await compiled('# Title', { sourcePositions: false });
    expect(code).not.toContain('__seminarAt');
    expect(code).not.toContain('__seminarSource');
  });

  it('tells the ranges with the helper, without any props', async () => {
    const code = await compiled('# Title\n\nText');
    expect(code).toContain(`import {__seminarAt as _seminarAt} from "${STUB}"`);
    expect(code).toMatch(/_seminarAt\(_jsx\(_SeminarParagraph, \{/);
    expect(code).not.toContain('__seminarSource');
  });

  it('tells where inline steps are', async () => {
    const code = await compiled('# Title\n\n:step[One] :step[Two]');
    expect(ranges(code)).toEqual(
      expect.arrayContaining(['3:1-3:11', '3:12-3:22']),
    );
  });

  it('tells where directive components are', async () => {
    const code = await compiled(
      '# Title\n\n:::Box{fancy}\nInside\n:::\n\nA :Box[b] c',
    );
    expect(ranges(code)).toEqual(
      expect.arrayContaining(['3:1-5:4', '4:1-4:7', '7:3-7:10']),
    );
  });

  it('tells where list items, code, and images are', async () => {
    const code = await compiled(
      '# Title\n\n- Item\n- Other\n\n```js\na\n```\n\n![a](b.png)',
    );
    expect(ranges(code)).toEqual(
      expect.arrayContaining(['3:1-3:7', '4:1-4:8', '6:1-8:4', '10:1-10:12']),
    );
  });

  it('tells where slides start, also before the first heading', async () => {
    const code = await compiled('Intro\n\n## Next\n\nText\n\n***\n\nMore');
    const slides = [
      ...code.matchAll(
        /_seminarAt\(_jsxs?\(__seminarSlide\d+, [^]*?"(\d+:\d+)-/g,
      ),
    ].map((match) => match[1]);
    expect(slides).toEqual(['1:1', '3:1', '7:1']);
  });

  it('tells where recaps are', async () => {
    const code = await compiled('## Next {#next}\n\n::recap[#next]');
    expect(ranges(code)).toContain('3:1-3:15');
  });

  it('also finds the JSX calls of the development runtime', async () => {
    const code = String(
      await compile('# Title\n\nText', {
        ...seminarMdxOptions({ importSource: STUB, sourcePositions: true }),
        development: true,
      }),
    );
    expect(code).toMatch(/_seminarAt\(_jsxDEV\(_SeminarParagraph, \{/);
    expect(code).not.toContain('__seminarSource');
  });
});
