import { describe, expect, it } from 'vitest';

import type { TextChange } from './attributeEdits.ts';
import type { SourceChange } from './slideTable.ts';
import {
  parseAttributeEdits,
  SourceEdits,
  type AttributeEdit,
} from './sourceEdits.ts';

const FILE = '/deck.deck.mdx';

/** A source being edited, which tells `SourceEdits` its changes. */
class Source {
  text: string;
  readonly edits = new SourceEdits();

  constructor(text: string) {
    this.text = text;
    this.edits.saved(FILE, text);
  }

  /** Replaces `start` to `end` with `added`, as an editor would. */
  change(start: number, end: number, added: string): void {
    const at = (offset: number) => {
      const before = this.text.slice(0, offset).split('\n');
      return [before.length - 1, before.at(-1)?.length ?? 0] as const;
    };
    const [startLine, startColumn] = at(start);
    const [endLine, endColumn] = at(end);
    const change: SourceChange = {
      startLine,
      startColumn,
      endLine,
      endColumn,
      text: added,
    };
    this.text = this.text.slice(0, start) + added + this.text.slice(end);
    this.edits.changed(FILE, [change]);
  }

  /** Types `added` at the start of the first `before`. */
  type(before: string, added: string): void {
    const offset = this.text.indexOf(before);
    this.change(offset, offset, added);
  }

  /** Makes `edits`, and applies their changes like an editor, last first. */
  edit(...edits: AttributeEdit[]): void {
    const changes: TextChange[] = this.edits.edit(FILE, this.text, edits);
    for (const { start, end, text } of changes.toReversed()) {
      this.change(start, end, text);
    }
  }

  get pending() {
    return this.edits.pending(FILE, this.text);
  }
}

/** The range of `line`, from 1, with the directive from `column` to `endColumn`. */
function range(line: number, column = 1, endLine = line, endColumn = 2) {
  return {
    start: { line, column },
    end: { line: endLine, column: endColumn },
  };
}

describe('SourceEdits', () => {
  const deck = '# Slide\n\nText:callout[A]{angle=35} here\n';
  const callout = range(3, 5, 3, 25);

  it('edits a directive where the saved source had it', () => {
    const source = new Source(deck);
    source.type('Text', 'More text\n\n');
    source.edit({ range: callout, changes: { angle: 40, offset: 60 } });
    expect(source.text).toBe(
      '# Slide\n\nMore text\n\nText:callout[A]{angle=40 offset=60} here\n',
    );
    expect(source.pending).toEqual([
      {
        range: callout,
        saved: { angle: 35 },
        attributes: { angle: 40, offset: 60 },
      },
    ]);
  });

  it('edits it again, and follows undoing by hand', () => {
    const source = new Source(deck);
    source.edit({ range: callout, changes: { angle: 40 } });
    source.edit({ range: callout, changes: { angle: 45 } });
    expect(source.text).toBe('# Slide\n\nText:callout[A]{angle=45} here\n');
    source.change(
      source.text.indexOf('45'),
      source.text.indexOf('45') + 2,
      '35',
    );
    expect(source.pending).toEqual([
      { range: callout, saved: { angle: 35 }, attributes: { angle: 35 } },
    ]);
  });

  it('refuses a directive that changed since saving', () => {
    const source = new Source(deck);
    source.type('}', ' step');
    expect(() => {
      source.edit({ range: callout, changes: { angle: 40 } });
    }).toThrow(/changed/);
    expect(source.pending).toEqual([]);
  });

  it('leaves out a directive that is gone, and refuses to edit it', () => {
    const source = new Source(deck);
    source.edit({ range: callout, changes: { angle: 40 } });
    const offset = source.text.indexOf(':callout');
    source.change(offset, offset + 1, '');
    expect(source.pending).toEqual([]);
    expect(() => {
      source.edit({ range: callout, changes: { angle: 45 } });
    }).toThrow(/changed/);
  });

  it('forgets the edits once saved', () => {
    const source = new Source(deck);
    source.edit({ range: callout, changes: { angle: 40 } });
    expect(source.edits.files).toEqual([FILE]);
    expect(source.edits.saved(FILE, source.text)).toBe(true);
    expect(source.edits.files).toEqual([]);
    expect(source.pending).toEqual([]);
  });

  it("refuses files whose changes since saving aren't known", () => {
    expect(() =>
      new SourceEdits().edit(FILE, deck, [
        { range: callout, changes: { angle: 40 } },
      ]),
    ).toThrow(/Save/);
  });

  describe('wrappers', () => {
    const columns = ':::column\nA\n:::\n\n:::column\nB\n:::\n';
    const wrapper = range(1, 1, 7, 4);
    const first = range(1, 1, 3, 4);
    const second = range(5, 1, 7, 4);

    it('writes the wrapper, and edits its columns too', () => {
      const source = new Source(columns);
      source.edit(
        { range: wrapper, wrapper: 'columns', changes: { gap: 64 } },
        { range: first, changes: { grow: 2 } },
      );
      expect(source.text).toBe(
        '::::columns{gap=64}\n:::column{grow=2}\nA\n:::\n\n:::column\nB\n:::\n::::\n',
      );
      source.edit(
        { range: wrapper, wrapper: 'columns', changes: { gap: 32 } },
        { range: second, changes: { grow: 3 } },
      );
      expect(source.text).toBe(
        '::::columns{gap=32}\n:::column{grow=2}\nA\n:::\n\n:::column{grow=3}\nB\n:::\n::::\n',
      );
      expect(source.pending).toEqual([
        {
          range: wrapper,
          wrapper: 'columns',
          saved: {},
          attributes: { gap: 32 },
        },
        { range: first, saved: {}, attributes: { grow: 2 } },
        { range: second, saved: {}, attributes: { grow: 3 } },
      ]);
    });

    it('keeps the wrapper apart from the column with the same range', () => {
      const source = new Source(':::column\nA\n:::\n');
      const only = range(1, 1, 3, 4);
      source.edit({ range: only, wrapper: 'columns', changes: { gap: 64 } });
      source.edit({ range: only, changes: { grow: 2 } });
      expect(source.text).toBe(
        '::::columns{gap=64}\n:::column{grow=2}\nA\n:::\n::::\n',
      );
    });

    it('writes nothing to remove attributes', () => {
      const source = new Source(columns);
      source.edit({
        range: wrapper,
        wrapper: 'columns',
        changes: { gap: null },
      });
      expect(source.text).toBe(columns);
      expect(source.pending).toEqual([]);
    });
  });
});

describe('parseAttributeEdits', () => {
  it('reads valid edits', () => {
    expect(
      parseAttributeEdits([
        {
          range: { ...range(1), file: '/other.deck.mdx' },
          changes: { angle: 3, step: true, label: 'x', at: null },
        },
      ]),
    ).toEqual([
      {
        range: range(1),
        file: '/other.deck.mdx',
        wrapper: undefined,
        changes: { angle: 3, step: true, label: 'x', at: null },
      },
    ]);
  });

  it('refuses anything else', () => {
    expect(parseAttributeEdits({})).toBeUndefined();
    expect(
      parseAttributeEdits([{ range: range(0), changes: {} }]),
    ).toBeUndefined();
    expect(
      parseAttributeEdits([{ range: range(1), changes: { a: [] } }]),
    ).toBeUndefined();
    expect(
      parseAttributeEdits([{ range: range(1), changes: { a: Infinity } }]),
    ).toBeUndefined();
  });
});
