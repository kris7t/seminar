/**
 * Reads and writes the objects of PDF files, as far as needed to update the
 * PDFs that Chromium prints. Bytes are kept in strings of Latin-1, one
 * character for each byte, so that offsets in them are offsets in the file.
 */

export class PdfName {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }
}

export class PdfRef {
  readonly num: number;
  readonly gen: number;

  constructor(num: number, gen = 0) {
    this.num = num;
    this.gen = gen;
  }
}

export class PdfString {
  /** The bytes of the string, as Latin-1. */
  readonly bytes: string;

  constructor(bytes: string) {
    this.bytes = bytes;
  }
}

export type PdfDict = Map<string, PdfValue>;

export type PdfValue =
  null | boolean | number | PdfName | PdfString | PdfRef | PdfValue[] | PdfDict;

/** Returns `text` as a PDF text string, in UTF-16 unless it is ASCII. */
export function textString(text: string): PdfString {
  if (/^[\x20-\x7e]*$/.test(text)) {
    return new PdfString(text);
  }
  const utf16 = Buffer.from(text, 'utf16le').swap16();
  return new PdfString(`\xfe\xff${utf16.toString('latin1')}`);
}

const WHITESPACE = /[\0\t\n\f\r ]/;
const DELIMITER = /[\0\t\n\f\r ()<>[\]{}/%]/;

/** Parses the objects of a PDF from its bytes. */
export class PdfParser {
  readonly bytes: string;
  #position = 0;

  constructor(bytes: string) {
    this.bytes = bytes;
  }

  get position(): number {
    return this.#position;
  }

  /** Moves to `position`, e.g., to the offset of an object. */
  seek(position: number): this {
    this.#position = position;
    return this;
  }

  #fail(message: string): never {
    throw new Error(`${message} at byte ${String(this.#position)} of the PDF`);
  }

  skipWhitespace(): void {
    for (;;) {
      const char = this.bytes[this.#position];
      if (char === '%') {
        while (
          this.#position < this.bytes.length &&
          !/[\r\n]/.test(this.bytes[this.#position] ?? '')
        ) {
          this.#position += 1;
        }
      } else if (char !== undefined && WHITESPACE.test(char)) {
        this.#position += 1;
      } else {
        return;
      }
    }
  }

  /** Reads a keyword or number, e.g., `obj` or `12`. */
  token(): string {
    this.skipWhitespace();
    const start = this.#position;
    while (
      this.#position < this.bytes.length &&
      !DELIMITER.test(this.bytes[this.#position] ?? '')
    ) {
      this.#position += 1;
    }
    if (this.#position === start) {
      this.#fail('Expected a token');
    }
    return this.bytes.slice(start, this.#position);
  }

  expect(keyword: string): void {
    const token = this.token();
    if (token !== keyword) {
      this.#fail(`Expected ${keyword}, not ${token}`);
    }
  }

  /** Reads the object `num gen obj value` here, and returns its value. */
  indirectObject(num: number): PdfValue {
    const found = Number(this.token());
    this.token();
    this.expect('obj');
    if (found !== num) {
      this.#fail(`Expected object ${String(num)}, not ${String(found)}`);
    }
    return this.value();
  }

  value(): PdfValue {
    this.skipWhitespace();
    const char = this.bytes[this.#position];
    switch (char) {
      case '/':
        return this.#name();
      case '(':
        return this.#literalString();
      case '[': {
        this.#position += 1;
        const values: PdfValue[] = [];
        for (;;) {
          this.skipWhitespace();
          if (this.bytes[this.#position] === ']') {
            this.#position += 1;
            return values;
          }
          values.push(this.value());
        }
      }
      case '<':
        if (this.bytes[this.#position + 1] === '<') {
          return this.#dict();
        }
        return this.#hexString();
      case undefined:
        return this.#fail('Expected a value');
      default:
        return this.#keywordOrNumber();
    }
  }

  #keywordOrNumber(): PdfValue {
    const token = this.token();
    switch (token) {
      case 'null':
        return null;
      case 'true':
        return true;
      case 'false':
        return false;
    }
    const number = Number(token);
    if (Number.isNaN(number)) {
      this.#fail(`Unexpected ${token}`);
    }
    // A reference, `num gen R`, starts like two numbers.
    if (/^\d+$/.test(token)) {
      const after = this.#position;
      try {
        const gen = this.token();
        if (/^\d+$/.test(gen) && this.token() === 'R') {
          return new PdfRef(number, Number(gen));
        }
      } catch {
        // Not a reference.
      }
      this.#position = after;
    }
    return number;
  }

  #name(): PdfName {
    this.#position += 1;
    const start = this.#position;
    while (
      this.#position < this.bytes.length &&
      !DELIMITER.test(this.bytes[this.#position] ?? '')
    ) {
      this.#position += 1;
    }
    return new PdfName(
      this.bytes
        .slice(start, this.#position)
        .replaceAll(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        ),
    );
  }

  #dict(): PdfDict {
    this.#position += 2;
    const dict: PdfDict = new Map();
    for (;;) {
      this.skipWhitespace();
      if (this.bytes.startsWith('>>', this.#position)) {
        this.#position += 2;
        return dict;
      }
      const key = this.value();
      if (!(key instanceof PdfName)) {
        this.#fail('Expected a name');
      }
      dict.set(key.name, this.value());
    }
  }

  #hexString(): PdfString {
    const end = this.bytes.indexOf('>', this.#position);
    if (end < 0) {
      this.#fail('Unterminated string');
    }
    const hex = this.bytes
      .slice(this.#position + 1, end)
      .replaceAll(/[\0\t\n\f\r ]/g, '');
    this.#position = end + 1;
    return new PdfString(
      Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, 'hex').toString(
        'latin1',
      ),
    );
  }

  #literalString(): PdfString {
    this.#position += 1;
    let bytes = '';
    let depth = 0;
    for (;;) {
      const char = this.bytes[this.#position];
      this.#position += 1;
      switch (char) {
        case undefined:
          return this.#fail('Unterminated string');
        case '(':
          depth += 1;
          bytes += char;
          break;
        case ')':
          if (depth === 0) {
            return new PdfString(bytes);
          }
          depth -= 1;
          bytes += char;
          break;
        case '\\': {
          const escaped = this.bytes[this.#position] ?? '';
          this.#position += 1;
          const octal = /^[0-7]{1,3}/.exec(
            this.bytes.slice(this.#position - 1, this.#position + 2),
          );
          if (octal !== null) {
            this.#position += octal[0].length - 1;
            bytes += String.fromCharCode(Number.parseInt(octal[0], 8) & 0xff);
          } else if (escaped === '\r') {
            // A line continuation.
            if (this.bytes[this.#position] === '\n') {
              this.#position += 1;
            }
          } else if (escaped !== '\n') {
            bytes +=
              { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[escaped] ??
              escaped;
          }
          break;
        }
        default:
          bytes += char;
      }
    }
  }
}

/** Returns `value` written as in a PDF. */
export function serialize(value: PdfValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (value instanceof PdfName) {
    return `/${value.name.replaceAll(/[^!-~]|[#()<>[\]{}/%]/g, (char) => `#${char.charCodeAt(0).toString(16).padStart(2, '0')}`)}`;
  }
  if (value instanceof PdfString) {
    return `(${value.bytes.replaceAll(/[\\()\r]/g, (char) => (char === '\r' ? '\\r' : `\\${char}`))})`;
  }
  if (value instanceof PdfRef) {
    return `${String(value.num)} ${String(value.gen)} R`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(' ')}]`;
  }
  return `<<${[...value].map(([key, entry]) => `${serialize(new PdfName(key))} ${serialize(entry)}`).join(' ')}>>`;
}
