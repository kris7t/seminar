import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  type PDFObject,
} from '@pdfme/pdf-lib';
import type { PrintedDocument } from '@seminar/core';
import { describe, expect, it } from 'vitest';

import { addDocumentInfo } from './documentInfo.ts';

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

async function load(document: PrintedDocument): Promise<PDFDocument> {
  return PDFDocument.load(await addDocumentInfo(SHEETS, document), {
    updateMetadata: false,
  });
}

/** Returns `object` as plain values, e.g., to compare it. */
function plain(object: PDFObject | undefined): unknown {
  if (object instanceof PDFNumber) {
    return object.asNumber();
  }
  if (
    object instanceof PDFName ||
    object instanceof PDFString ||
    object instanceof PDFHexString
  ) {
    return object.decodeText();
  }
  if (object instanceof PDFArray) {
    return object.asArray().map(plain);
  }
  if (object instanceof PDFDict) {
    return Object.fromEntries(
      [...object.entries()].map(([key, value]) => [
        key.decodeText(),
        plain(value),
      ]),
    );
  }
  return object;
}

/** Returns the items of the outline from `first`. */
function outline(doc: PDFDocument, first: PDFObject | undefined): unknown[] {
  const items: unknown[] = [];
  let item = first === undefined ? undefined : doc.context.lookup(first);
  while (item instanceof PDFDict) {
    items.push({
      title: plain(item.get(PDFName.of('Title'))),
      dest: plain(item.get(PDFName.of('Dest'))),
      count: plain(item.get(PDFName.of('Count'))),
      children: outline(doc, item.get(PDFName.of('First'))),
    });
    const next = item.get(PDFName.of('Next'));
    item = next === undefined ? undefined : doc.context.lookup(next);
  }
  return items;
}

describe('addDocumentInfo', () => {
  it('labels the pages of each sheet', async () => {
    const doc = await load(printed);
    expect(doc.getPageCount()).toBe(5);
    expect(plain(doc.catalog.get(PDFName.of('PageLabels')))).toEqual({
      // The pages of the second sheet have the label of the first.
      Nums: [0, { P: '1' }, 4, { P: '2' }],
    });
  });

  it('leaves the pages of sheets without labels numbered', async () => {
    const doc = await load({
      ...printed,
      sheets: printed.sheets.map(({ id }) => ({ id })),
    });
    expect(doc.catalog.has(PDFName.of('PageLabels'))).toBe(false);
  });

  it('adds the outline, going to the named destinations of the sheets', async () => {
    const doc = await load(printed);
    expect(plain(doc.catalog.get(PDFName.of('PageMode')))).toBe('UseOutlines');
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(plain(outlines.get(PDFName.of('Count')))).toBe(3);
    expect(outline(doc, outlines.get(PDFName.of('First')))).toEqual([
      {
        title: 'Bevezetés',
        dest: 'seminar-print-sheet-1',
        count: 1,
        children: [
          {
            title: 'Details',
            dest: 'seminar-print-sheet-3',
            count: undefined,
            children: [],
          },
        ],
      },
      {
        title: 'Summary',
        dest: 'seminar-print-sheet-3',
        count: undefined,
        children: [],
      },
    ]);
  });

  it('leaves out the outline if there is none', async () => {
    const doc = await load({ ...printed, outline: [] });
    expect(doc.catalog.has(PDFName.of('Outlines'))).toBe(false);
    expect(doc.catalog.has(PDFName.of('PageMode'))).toBe(false);
  });

  it('adds the metadata of the deck', async () => {
    const doc = await load(printed);
    expect(doc.getTitle()).toBe('Talk');
    expect(doc.getAuthor()).toBe('Ada, Kristóf');
    expect(doc.getSubject()).toBe('A talk');
    expect(doc.getKeywords()).toBe('a, b');
    expect(doc.getCreator()).toBe('Seminar');
    // Kept from Chromium.
    expect(doc.getProducer()).toMatch(/^Skia\/PDF/);
    const metadata = doc.catalog.lookup(PDFName.of('Metadata'));
    expect(metadata).toBeInstanceOf(PDFRawStream);
    const xmp = Buffer.from((metadata as PDFRawStream).contents).toString(
      'utf8',
    );
    expect(xmp).toContain(
      '<dc:creator><rdf:Seq><rdf:li>Ada</rdf:li><rdf:li>Kristóf</rdf:li></rdf:Seq></dc:creator>',
    );
    expect(xmp).toContain('<pdf:Producer>Skia/PDF');
    expect(xmp).toContain('<xmp:CreatorTool>Seminar</xmp:CreatorTool>');
    expect(xmp).toMatch(/<xmp:CreateDate>[\d-]+T[\d:.]+Z<\/xmp:CreateDate>/);
  });
});
