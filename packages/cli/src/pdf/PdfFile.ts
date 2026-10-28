import {
  PdfName,
  PdfParser,
  PdfRef,
  serialize,
  type PdfDict,
  type PdfValue,
} from './syntax.ts';

/**
 * A PDF with a cross-reference table, like those that Chromium prints, which
 * new objects can be added to, or objects redefined in, by an incremental
 * update that leaves its bytes as they are.
 */
export class PdfFile {
  readonly #bytes: string;
  readonly #parser: PdfParser;
  /** Offsets of the objects, by number. */
  readonly #offsets = new Map<number, number>();
  readonly #startxref: number;
  readonly trailer: PdfDict;
  #size: number;
  readonly #updates = new Map<number, { gen: number; body: string }>();

  /** @param bytes The bytes of the PDF, as Latin-1. */
  constructor(bytes: string) {
    this.#bytes = bytes;
    this.#parser = new PdfParser(bytes);
    const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(bytes.slice(-1024));
    if (startxref?.[1] === undefined) {
      throw new Error("The PDF doesn't end with the offset of its xref.");
    }
    this.#startxref = Number(startxref[1]);
    let trailer: PdfDict | undefined;
    let offset: number | undefined = this.#startxref;
    while (offset !== undefined) {
      const section = this.#readXref(offset);
      trailer ??= section;
      const previous = section.get('Prev');
      offset = typeof previous === 'number' ? previous : undefined;
    }
    this.trailer = trailer ?? new Map<string, PdfValue>();
    const size = this.trailer.get('Size');
    this.#size = typeof size === 'number' ? size : 0;
  }

  /** Reads the xref section at `offset`, and returns its trailer. */
  #readXref(offset: number): PdfDict {
    const parser = this.#parser.seek(offset);
    if (parser.token() !== 'xref') {
      throw new Error(
        'The PDF has an xref stream, but only xref tables are supported.',
      );
    }
    for (;;) {
      const start = parser.token();
      if (start === 'trailer') {
        break;
      }
      const count = Number(parser.token());
      for (let i = 0; i < count; i++) {
        const entryOffset = Number(parser.token());
        parser.token();
        const num = Number(start) + i;
        // Newer sections, which are read first, take precedence.
        if (parser.token() === 'n' && !this.#offsets.has(num)) {
          this.#offsets.set(num, entryOffset);
        }
      }
    }
    const trailer = parser.value();
    if (!(trailer instanceof Map)) {
      throw new Error('The trailer of the PDF is not a dictionary.');
    }
    return trailer;
  }

  /** Returns `value`, or the object it refers to. */
  resolve(value: PdfValue | undefined): PdfValue | undefined {
    if (!(value instanceof PdfRef)) {
      return value;
    }
    const offset = this.#offsets.get(value.num);
    return offset === undefined
      ? undefined
      : this.#parser.seek(offset).indirectObject(value.num);
  }

  /** Returns `value`, or the object it refers to, if it is a dictionary. */
  dict(value: PdfValue | undefined): PdfDict | undefined {
    const resolved = this.resolve(value);
    return resolved instanceof Map ? resolved : undefined;
  }

  /** Returns the references of the pages in `pages`, in order. */
  pages(pages: PdfValue | undefined): PdfRef[] {
    const node = this.dict(pages);
    const kids = this.resolve(node?.get('Kids'));
    if (!Array.isArray(kids)) {
      return [];
    }
    return kids.flatMap((kid) => {
      if (!(kid instanceof PdfRef)) {
        return [];
      }
      const type = this.dict(kid)?.get('Type');
      return type instanceof PdfName && type.name === 'Pages'
        ? this.pages(kid)
        : [kid];
    });
  }

  /** Adds an object, and returns a reference to it. */
  add(value: PdfValue): PdfRef {
    const ref = new PdfRef(this.#size);
    this.#size += 1;
    this.set(ref, value);
    return ref;
  }

  /** Adds a stream of `data` with the entries of `dict`. */
  addStream(dict: PdfDict, data: Buffer): PdfRef {
    const ref = new PdfRef(this.#size);
    this.#size += 1;
    this.#updates.set(ref.num, {
      gen: ref.gen,
      body: `${serialize(new Map([...dict, ['Length', data.length]]))}\nstream\n${data.toString('latin1')}\nendstream`,
    });
    return ref;
  }

  /** Defines the object of `ref` as `value`. */
  set(ref: PdfRef, value: PdfValue): void {
    this.#updates.set(ref.num, { gen: ref.gen, body: serialize(value) });
  }

  /**
   * Returns the bytes of the PDF with the objects added or defined, with
   * `trailer` setting entries of the trailer.
   */
  write(trailer: PdfDict = new Map()): Buffer {
    let update = this.#bytes.endsWith('\n') ? '' : '\n';
    const offsets = new Map<number, number>();
    const nums = [...this.#updates.keys()].sort((a, b) => a - b);
    for (const num of nums) {
      const { gen, body } = this.#updates.get(num) ?? { gen: 0, body: '' };
      offsets.set(num, this.#bytes.length + update.length);
      update += `${String(num)} ${String(gen)} obj\n${body}\nendobj\n`;
    }
    const xref = this.#bytes.length + update.length;
    update += 'xref\n';
    for (let i = 0; i < nums.length;) {
      let end = i + 1;
      while (nums[end] === (nums[end - 1] ?? 0) + 1) {
        end += 1;
      }
      update += `${String(nums[i])} ${String(end - i)}\n`;
      for (const num of nums.slice(i, end)) {
        const gen = this.#updates.get(num)?.gen ?? 0;
        // Each entry is exactly 20 bytes.
        update += `${String(offsets.get(num)).padStart(10, '0')} ${String(gen).padStart(5, '0')} n \n`;
      }
      i = end;
    }
    const entries = new Map(this.trailer);
    entries.delete('Prev');
    for (const [key, value] of trailer) {
      entries.set(key, value);
    }
    entries.set('Size', this.#size);
    entries.set('Prev', this.#startxref);
    update += `trailer\n${serialize(entries)}\nstartxref\n${String(xref)}\n%%EOF\n`;
    return Buffer.concat([
      Buffer.from(this.#bytes, 'latin1'),
      Buffer.from(update, 'latin1'),
    ]);
  }
}
