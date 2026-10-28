import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  type PDFObject,
} from '@pdfme/pdf-lib';
import type { PrintedDocument, PrintedOutlineEntry } from '@seminar/core';

/** Starts XMP packets, whatever their encoding. */
const BYTE_ORDER_MARK = '\uFEFF';

/** The application that made the PDF, in its document info. */
const CREATOR = 'Seminar';

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
  created?: Date | undefined;
  modified?: Date | undefined;
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
      : `<xmp:CreateDate>${info.created.toISOString()}</xmp:CreateDate>`,
    info.modified === undefined
      ? undefined
      : `<xmp:ModifyDate>${info.modified.toISOString()}</xmp:ModifyDate>`,
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
export async function addDocumentInfo(
  pdf: Uint8Array,
  printed: PrintedDocument,
): Promise<Uint8Array> {
  // Keeps the producer and dates that Chromium set.
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const { catalog, context } = doc;
  const pageIndices = new Map(
    doc.getPages().map((page, i) => [page.ref, i] as const),
  );
  const dests = catalog.lookupMaybe(PDFName.of('Dests'), PDFDict);
  // The page that each sheet starts on, from its named destination.
  const sheetPages = printed.sheets.map(({ id }) => {
    const page = dests?.lookupMaybe(PDFName.of(id), PDFArray)?.get(0);
    return page instanceof PDFRef ? pageIndices.get(page) : undefined;
  });

  if (printed.sheets.some(({ label }) => label !== undefined)) {
    const nums: (number | PDFObject)[] = [];
    let previous: string | undefined;
    for (const [sheet, { label }] of printed.sheets.entries()) {
      const page = sheetPages[sheet];
      // The pages of a range with only a prefix all have it as their label.
      if (page !== undefined && (label === undefined || label !== previous)) {
        previous = label;
        nums.push(
          page,
          context.obj(
            label === undefined
              ? { S: 'D', St: page + 1 }
              : { P: PDFHexString.fromText(label) },
          ),
        );
      }
    }
    if (nums[0] === 0) {
      catalog.set(PDFName.of('PageLabels'), context.obj({ Nums: nums }));
    }
  }

  /** Adds the items of `entries`, and returns the first, last, and count. */
  const addItems = (
    entries: readonly PrintedOutlineEntry[],
    parent: PDFRef,
  ): { First: PDFRef; Last: PDFRef; Count: number } | undefined => {
    const refs = entries.map(() => context.nextRef());
    let count = entries.length;
    for (const [i, { title, sheet, children }] of entries.entries()) {
      const ref = refs[i];
      if (ref === undefined) {
        continue;
      }
      // Open, showing the nested entries.
      const nested = addItems(children, ref);
      count += nested?.Count ?? 0;
      const id = printed.sheets[sheet]?.id;
      context.assign(
        ref,
        context.obj({
          Title: PDFHexString.fromText(title),
          Parent: parent,
          Prev: refs[i - 1],
          Next: refs[i + 1],
          ...nested,
          Dest: id !== undefined && dests?.has(PDFName.of(id)) ? id : undefined,
        }),
      );
    }
    const first = refs[0];
    const last = refs.at(-1);
    return first === undefined || last === undefined
      ? undefined
      : { First: first, Last: last, Count: count };
  };
  if (printed.outline.length > 0) {
    const outlines = context.nextRef();
    context.assign(
      outlines,
      context.obj({
        Type: 'Outlines',
        ...addItems(printed.outline, outlines),
      }),
    );
    catalog.set(PDFName.of('Outlines'), outlines);
    catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }

  const { title, authors, description, keywords } = printed.metadata;
  doc.setTitle(title);
  if (authors !== undefined) {
    doc.setAuthor(authors.join(', '));
  }
  if (description !== undefined) {
    doc.setSubject(description);
  }
  if (keywords !== undefined) {
    // Joined with `,`, unlike by pdf-lib, since keywords may have spaces.
    doc.setKeywords([keywords.join(', ')]);
  }
  doc.setCreator(CREATOR);
  catalog.set(
    PDFName.of('Metadata'),
    context.register(
      context.stream(
        Buffer.from(
          xmp({
            title,
            authors,
            description,
            keywords,
            producer: doc.getProducer(),
            created: doc.getCreationDate(),
            modified: doc.getModificationDate(),
          }),
          'utf8',
        ),
        { Type: 'Metadata', Subtype: 'XML' },
      ),
    ),
  );
  return doc.save();
}
