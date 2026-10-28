import { describe, expect, it } from 'vitest';

import {
  PdfName,
  PdfParser,
  PdfRef,
  PdfString,
  serialize,
  textString,
} from './syntax.ts';

const parse = (bytes: string) => new PdfParser(bytes).value();

describe('PdfParser', () => {
  it('parses dictionaries, arrays, and references', () => {
    expect(
      parse(
        '<</Type /Page /Kids [3 0 R 4 0 R] /Count 2 /Box [0 0.5 -1] /A#20B true /N null>>',
      ),
    ).toEqual(
      new Map<string, unknown>([
        ['Type', new PdfName('Page')],
        ['Kids', [new PdfRef(3), new PdfRef(4)]],
        ['Count', 2],
        ['Box', [0, 0.5, -1]],
        ['A B', true],
        ['N', null],
      ]),
    );
  });

  it('parses strings with escapes and nested parentheses', () => {
    expect(parse('(a\\(b\\) (c) \\\\ \\n\\101\\\nd)')).toEqual(
      new PdfString('a(b) (c) \\ \nAd'),
    );
    expect(parse('<FEFF 0151>')).toEqual(new PdfString('\xfe\xff\x01\x51'));
  });

  it('skips comments', () => {
    expect(parse('% A comment\n[1 % another\n2]')).toEqual([1, 2]);
  });

  it('reads indirect objects', () => {
    expect(
      new PdfParser('7 0 obj\n<</A 1>>\nendobj').indirectObject(7),
    ).toEqual(new Map([['A', 1]]));
    expect(() => new PdfParser('7 0 obj 1 endobj').indirectObject(8)).toThrow(
      'Expected object 8, not 7',
    );
  });
});

describe('serialize', () => {
  it('writes what the parser reads', () => {
    const value = new Map<string, unknown>([
      ['Title', new PdfString('a(b)\\c\r')],
      ['Name with space', new PdfName('x/y')],
      ['Kids', [new PdfRef(3, 1), 1.5, null, false]],
    ]);
    const written = serialize(value as Parameters<typeof serialize>[0]);
    expect(written).toBe(
      '<</Title (a\\(b\\)\\\\c\\r) /Name#20with#20space /x#2fy /Kids [3 1 R 1.5 null false]>>',
    );
    expect(parse(written)).toEqual(value);
  });
});

describe('textString', () => {
  it('writes ASCII as is, and other text in UTF-16', () => {
    expect(textString('Slides')).toEqual(new PdfString('Slides'));
    expect(textString('ő')).toEqual(new PdfString('\xfe\xff\x01\x51'));
  });
});
