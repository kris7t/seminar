import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PrintedDocument } from '@seminar/core';
import { describe, expect, it } from 'vitest';

import { addDocumentInfo } from './documentInfo.ts';
import { PdfFile } from './PdfFile.ts';
import {
  PdfName,
  PdfRef,
  PdfString,
  textString,
  type PdfDict,
  type PdfValue,
} from './syntax.ts';

/**
 * Printed by Chromium with the sheets `seminar-print-sheet-1` to `-3` on
 * pages 1, 2 to 4, and 5, and the title `Előadás`.
 */
const SHEETS = readFileSync(
  path.join(import.meta.dirname, '../test/sheets.pdf'),
);

const printed: PrintedDocument = {
  sheets: [
    { id: 'seminar-print-sheet-1', label: '1' },
    { id: 'seminar-print-sheet-2', label: '1' },
    { id: 'seminar-print-sheet-3', label: '2' },
  ],
  outline: [
    {
      title: 'Bevezetés',
      sheet: 0,
      children: [{ title: 'Details', sheet: 2, children: [] }],
    },
    { title: 'Summary', sheet: 2, children: [] },
  ],
  metadata: {
    title: 'Talk',
    authors: ['Ada', 'Kristóf'],
    description: 'A talk',
    keywords: ['a', 'b'],
  },
};

function read(pdf: Buffer) {
  const file = new PdfFile(pdf.toString('latin1'));
  const catalog: PdfDict =
    file.dict(file.trailer.get('Root')) ?? new Map<string, PdfValue>();
  return { file, catalog };
}

/** Returns the titles of the outline items from `first`, with their dests. */
function outline(file: PdfFile, first: PdfValue | undefined): unknown[] {
  const items: unknown[] = [];
  let item = file.dict(first);
  while (item !== undefined) {
    items.push({
      title: item.get('Title'),
      dest: item.get('Dest'),
      count: item.get('Count'),
      children: outline(file, item.get('First')),
    });
    item = file.dict(item.get('Next'));
  }
  return items;
}

describe('addDocumentInfo', () => {
  it('adds an incremental update to the PDF', () => {
    const updated = addDocumentInfo(SHEETS, printed);
    expect(updated.subarray(0, SHEETS.length).equals(SHEETS)).toBe(true);
    expect(updated.toString('latin1')).toMatch(/\nstartxref\n\d+\n%%EOF\n$/);
    const { file, catalog } = read(updated);
    expect(file.pages(catalog.get('Pages'))).toHaveLength(5);
  });

  it('labels the pages of each sheet', () => {
    const { catalog } = read(addDocumentInfo(SHEETS, printed));
    expect(catalog.get('PageLabels')).toEqual(
      new Map([
        [
          'Nums',
          [
            0,
            new Map([['P', new PdfString('1')]]),
            // The pages of the second sheet have the label of the first.
            4,
            new Map([['P', new PdfString('2')]]),
          ],
        ],
      ]),
    );
  });

  it('leaves the pages of sheets without labels numbered', () => {
    const { catalog } = read(
      addDocumentInfo(SHEETS, {
        ...printed,
        sheets: printed.sheets.map(({ id }) => ({ id })),
      }),
    );
    expect(catalog.has('PageLabels')).toBe(false);
  });

  it('adds the outline, going to the named destinations of the sheets', () => {
    const { file, catalog } = read(addDocumentInfo(SHEETS, printed));
    expect(catalog.get('PageMode')).toEqual(new PdfName('UseOutlines'));
    const outlines = file.dict(catalog.get('Outlines'));
    expect(outlines?.get('Count')).toBe(3);
    expect(outline(file, outlines?.get('First'))).toEqual([
      {
        title: textString('Bevezetés'),
        dest: new PdfName('seminar-print-sheet-1'),
        count: 1,
        children: [
          {
            title: new PdfString('Details'),
            dest: new PdfName('seminar-print-sheet-3'),
            count: undefined,
            children: [],
          },
        ],
      },
      {
        title: new PdfString('Summary'),
        dest: new PdfName('seminar-print-sheet-3'),
        count: undefined,
        children: [],
      },
    ]);
  });

  it('adds the metadata of the deck', () => {
    const updated = addDocumentInfo(SHEETS, printed);
    const { file, catalog } = read(updated);
    const info = file.dict(file.trailer.get('Info'));
    expect(info?.get('Title')).toEqual(new PdfString('Talk'));
    expect(info?.get('Author')).toEqual(textString('Ada, Kristóf'));
    expect(info?.get('Subject')).toEqual(new PdfString('A talk'));
    expect(info?.get('Keywords')).toEqual(new PdfString('a, b'));
    expect(info?.get('Creator')).toEqual(new PdfString('Seminar'));
    // Kept from Chromium.
    expect(info?.get('Producer')).toEqual(expect.any(PdfString));
    const metadata = catalog.get('Metadata');
    expect(metadata).toBeInstanceOf(PdfRef);
    const text = updated.subarray(SHEETS.length).toString('utf8');
    expect(text).toContain(
      '<dc:creator><rdf:Seq><rdf:li>Ada</rdf:li><rdf:li>Kristóf</rdf:li></rdf:Seq></dc:creator>',
    );
    expect(text).toContain('<xmp:CreatorTool>Seminar</xmp:CreatorTool>');
    expect(text).toMatch(
      /<xmp:CreateDate>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})<\/xmp:CreateDate>/,
    );
  });

  it('leaves out the outline if there is none', () => {
    const { catalog } = read(
      addDocumentInfo(SHEETS, { ...printed, outline: [] }),
    );
    expect(catalog.has('Outlines')).toBe(false);
    expect(catalog.has('PageMode')).toBe(false);
  });
});
