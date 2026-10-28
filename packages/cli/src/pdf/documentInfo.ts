import type { PrintedDocument, PrintedOutlineEntry } from '@seminar/core';

import { PdfFile } from './PdfFile.ts';
import {
  PdfName,
  PdfRef,
  PdfString,
  textString,
  type PdfDict,
  type PdfValue,
} from './syntax.ts';

/** Starts XMP packets, whatever their encoding. */
const BYTE_ORDER_MARK = '\uFEFF';

/** The application that made the PDF, in its document info. */
const CREATOR = 'Seminar';

/** Returns the text of a PDF text string, e.g., of the document info. */
function readText(value: PdfValue | undefined): string | undefined {
  if (!(value instanceof PdfString)) {
    return undefined;
  }
  return value.bytes.startsWith('\xfe\xff')
    ? Buffer.from(value.bytes.slice(2), 'latin1').swap16().toString('utf16le')
    : value.bytes;
}

/** Returns a PDF date, like `D:20261028011455+00'00'`, in ISO 8601. */
function isoDate(date: string | undefined): string | undefined {
  const time = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/;
  const zone = /^([+-])(\d{2})'(\d{2})/;
  const match = time.exec(date ?? '');
  if (date === undefined || match === null) {
    return undefined;
  }
  const offset = zone.exec(date.slice(match[0].length));
  return `${match[0].replace(time, '$1-$2-$3T$4:$5:$6')}${
    offset === null || /^.00'00$/.test(offset[0])
      ? 'Z'
      : offset[0].replace(zone, '$1$2:$3')
  }`;
}

function escapeXml(text: string): string {
  return text.replaceAll(
    /[&<>"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );
}

/** Returns the XMP metadata with the same as the document info. */
function xmp(info: {
  title: string;
  authors?: readonly string[] | undefined;
  description?: string | undefined;
  keywords?: readonly string[] | undefined;
  producer?: string | undefined;
  created?: string | undefined;
  modified?: string | undefined;
}): string {
  const alt = (text: string) =>
    `<rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(text)}</rdf:li></rdf:Alt>`;
  const list = (kind: string, items: readonly string[]) =>
    `<rdf:${kind}>${items.map((item) => `<rdf:li>${escapeXml(item)}</rdf:li>`).join('')}</rdf:${kind}>`;
  const properties = [
    '<dc:format>application/pdf</dc:format>',
    `<dc:title>${alt(info.title)}</dc:title>`,
    info.authors === undefined
      ? undefined
      : `<dc:creator>${list('Seq', info.authors)}</dc:creator>`,
    info.description === undefined
      ? undefined
      : `<dc:description>${alt(info.description)}</dc:description>`,
    info.keywords === undefined
      ? undefined
      : `<dc:subject>${list('Bag', info.keywords)}</dc:subject>`,
    info.keywords === undefined
      ? undefined
      : `<pdf:Keywords>${escapeXml(info.keywords.join(', '))}</pdf:Keywords>`,
    info.producer === undefined
      ? undefined
      : `<pdf:Producer>${escapeXml(info.producer)}</pdf:Producer>`,
    `<xmp:CreatorTool>${CREATOR}</xmp:CreatorTool>`,
    info.created === undefined
      ? undefined
      : `<xmp:CreateDate>${info.created}</xmp:CreateDate>`,
    info.modified === undefined
      ? undefined
      : `<xmp:ModifyDate>${info.modified}</xmp:ModifyDate>`,
  ].filter((property) => property !== undefined);
  // The id is the same in every XMP packet, as the XMP specification sets.
  return `<?xpacket begin="${BYTE_ORDER_MARK}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
${properties.join('\n')}
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Adds to a PDF printed by Chromium what `printed` tells about it: the labels
 * of its pages, e.g., the numbers of their slides, the outline, and the
 * metadata of the deck in its document info and XMP metadata.
 */
export function addDocumentInfo(
  pdf: Uint8Array,
  printed: PrintedDocument,
): Buffer {
  const file = new PdfFile(Buffer.from(pdf).toString('latin1'));
  const root = file.trailer.get('Root');
  const catalog = file.dict(root);
  if (!(root instanceof PdfRef) || catalog === undefined) {
    throw new Error('The PDF has no catalog.');
  }
  const pages = file.pages(catalog.get('Pages'));
  const pageIndices = new Map(pages.map((page, i) => [page.num, i]));
  const dests = file.dict(catalog.get('Dests'));
  // The page that each sheet starts on, from its named destination.
  const sheetPages = printed.sheets.map(({ id }) => {
    const dest = file.resolve(dests?.get(id));
    const page = Array.isArray(dest) ? dest[0] : undefined;
    return page instanceof PdfRef ? pageIndices.get(page.num) : undefined;
  });

  if (printed.sheets.some(({ label }) => label !== undefined)) {
    const nums: PdfValue[] = [];
    let previous: string | undefined;
    for (const [sheet, { label }] of printed.sheets.entries()) {
      const page = sheetPages[sheet];
      // The pages of a range with only a prefix all have it as their label.
      if (page !== undefined && (label === undefined || label !== previous)) {
        previous = label;
        nums.push(
          page,
          label === undefined
            ? new Map<string, PdfValue>([
                ['S', new PdfName('D')],
                ['St', page + 1],
              ])
            : new Map([['P', textString(label)]]),
        );
      }
    }
    if (nums[0] === 0) {
      catalog.set('PageLabels', new Map([['Nums', nums]]));
    }
  }

  if (printed.outline.length > 0) {
    const outlines = file.add(null);
    const addItems = (
      entries: readonly PrintedOutlineEntry[],
      parent: PdfRef,
    ): { first: PdfRef; last: PdfRef; count: number } | undefined => {
      const refs = entries.map(() => file.add(null));
      let count = entries.length;
      for (const [i, { title, sheet, children }] of entries.entries()) {
        const ref = refs[i];
        const id = printed.sheets[sheet]?.id;
        if (ref === undefined) {
          continue;
        }
        const item: PdfDict = new Map<string, PdfValue>([
          ['Title', textString(title)],
          ['Parent', parent],
        ]);
        const previous = refs[i - 1];
        const next = refs[i + 1];
        if (previous !== undefined) {
          item.set('Prev', previous);
        }
        if (next !== undefined) {
          item.set('Next', next);
        }
        const nested = addItems(children, ref);
        if (nested !== undefined) {
          item.set('First', nested.first);
          item.set('Last', nested.last);
          // Open, showing the nested entries.
          item.set('Count', nested.count);
          count += nested.count;
        }
        if (id !== undefined && dests?.has(id) === true) {
          item.set('Dest', new PdfName(id));
        }
        file.set(ref, item);
      }
      const first = refs[0];
      const last = refs.at(-1);
      return first === undefined || last === undefined
        ? undefined
        : { first, last, count };
    };
    const items = addItems(printed.outline, outlines);
    file.set(
      outlines,
      new Map<string, PdfValue>([
        ['Type', new PdfName('Outlines')],
        ...(items === undefined
          ? []
          : ([
              ['First', items.first],
              ['Last', items.last],
              ['Count', items.count],
            ] as const)),
      ]),
    );
    catalog.set('Outlines', outlines);
    catalog.set('PageMode', new PdfName('UseOutlines'));
  }

  const { title, authors, description, keywords } = printed.metadata;
  const infoRef = file.trailer.get('Info');
  const info = new Map(file.dict(infoRef) ?? []);
  info.set('Title', textString(title));
  if (authors !== undefined) {
    info.set('Author', textString(authors.join(', ')));
  }
  if (description !== undefined) {
    info.set('Subject', textString(description));
  }
  if (keywords !== undefined) {
    info.set('Keywords', textString(keywords.join(', ')));
  }
  info.set('Creator', textString(CREATOR));
  const newInfo = infoRef instanceof PdfRef ? infoRef : file.add(null);
  file.set(newInfo, info);

  catalog.set(
    'Metadata',
    file.addStream(
      new Map([
        ['Type', new PdfName('Metadata')],
        ['Subtype', new PdfName('XML')],
      ]),
      Buffer.from(
        xmp({
          title,
          authors,
          description,
          keywords,
          producer: readText(info.get('Producer')),
          created: isoDate(readText(info.get('CreationDate'))),
          modified: isoDate(readText(info.get('ModDate'))),
        }),
        'utf8',
      ),
    ),
  );
  file.set(root, catalog);
  return file.write(new Map([['Info', newInfo]]));
}
