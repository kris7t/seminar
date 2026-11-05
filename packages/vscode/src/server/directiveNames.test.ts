import { deckSyntaxPlugins } from '@seminar/mdx/syntax';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { completeDirectiveName } from './directiveNames.ts';

const DIRECTIVES = {
  callout: { source: '@seminar/elements', exportName: 'CalloutDirective' },
  column: {
    source: '@seminar/elements',
    exportName: 'Column',
    forms: ['container' as const],
  },
  mark: {
    source: './Mark.tsx',
    exportName: 'Mark',
    forms: ['text' as const, 'leaf' as const],
    content: true,
  },
};

/**
 * Completes the directive name at `|` in `deck`, returning the replaced text
 * and the snippets of the items.
 */
function complete(deck: string, invoked = false) {
  const offset = deck.indexOf('|');
  const source = deck.slice(0, offset) + deck.slice(offset + 1);
  const root = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins([remarkMath]))
    .parse(source);
  const completion = completeDirectiveName(
    source,
    root,
    offset,
    DIRECTIVES,
    invoked,
  );
  return (
    completion && {
      replaced: source.slice(completion.start, completion.end),
      items: Object.fromEntries(
        completion.items.map(({ name, insertText }) => [name, insertText]),
      ),
    }
  );
}

describe('completeDirectiveName', () => {
  it('completes text directives with their names', () => {
    expect(complete('A :|')).toEqual({
      replaced: '',
      items: { step: 'step', callout: 'callout', mark: 'mark[$1]' },
    });
    expect(complete('A :ca|')?.replaced).toBe('ca');
    expect(complete('A :ca|llout{x}')?.replaced).toBe('callout');
  });

  it('completes text directives after words once their names start', () => {
    expect(complete('this:c|')?.replaced).toBe('c');
    expect(complete('Note:|')).toBeUndefined();
    expect(complete('Note:|', true)?.replaced).toBe('');
    expect(complete('A ::|b')).toBeUndefined();
    expect(complete('A \\:|')).toBeUndefined();
  });

  it('completes leaf directives, with labels where they need them', () => {
    expect(complete('::|')).toEqual({
      replaced: '',
      items: {
        step: 'step',
        slide: 'slide',
        recap: 'recap[$1]',
        include: 'include[$1]',
        callout: 'callout',
        mark: 'mark[$1]',
      },
    });
  });

  it('closes container directives with as many colons', () => {
    expect(complete('> ::::|')?.items).toEqual({
      step: 'step\n> $0\n> ::::',
      notes: 'notes\n> $0\n> ::::',
      callout: 'callout\n> $0\n> ::::',
      column: 'column\n> $0\n> ::::',
    });
    expect(complete(':::no|')?.items['notes']).toBe('notes\n$0\n:::');
  });

  it('leaves the fences of containers that have them', () => {
    expect(complete(':::no|\nText\n:::\n')?.items['notes']).toBe('notes');
    expect(complete(':::no|[Title]')?.items['notes']).toBe('notes');
    expect(complete('::::callout\n:::co|\nText\n::::\n')?.items['column']).toBe(
      'column\n$0\n:::',
    );
  });

  it('completes nothing where directives are not markdown', () => {
    expect(complete('```\n::|\n```')).toBeUndefined();
    expect(complete('A `:|`')).toBeUndefined();
    expect(complete('A $:|$')).toBeUndefined();
    expect(complete('---\na: :|\n---\n')).toBeUndefined();
    expect(complete('<Box a=":|" />')).toBeUndefined();
    expect(complete('A {":|"}')).toBeUndefined();
    expect(complete(':callout{a=:|}')).toBeUndefined();
  });

  it('completes in the content of JSX and directives', () => {
    expect(complete('<Box>\n  A :|\n</Box>')?.replaced).toBe('');
    expect(complete(':::callout\nA :s|\n:::')?.replaced).toBe('s');
  });
});
