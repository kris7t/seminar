import { describe, expect, it } from 'vitest';

import {
  editAttributes,
  formatAttribute,
  readAttributes,
  wrapInDirective,
  type AttributeChanges,
  type TextChange,
} from './attributeEdits.ts';

function apply(source: string, changes: readonly TextChange[]): string {
  return [...changes]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, { start, end, text: added }) =>
        text.slice(0, start) + added + text.slice(end),
      source,
    );
}

/** Edits the attributes of the directive at the start of `source`. */
function edit(source: string, changes: AttributeChanges): string {
  const change = editAttributes(source, 0, changes);
  return change === undefined ? source : apply(source, [change]);
}

describe('formatAttribute', () => {
  it('writes values that read back with their types', () => {
    expect(formatAttribute('callout', 'angle', 35)).toBe('angle=35');
    expect(formatAttribute('callout', 'offset', -0.5)).toBe('offset=-0.5');
    expect(formatAttribute('callout', 'step', true)).toBe('step');
    expect(formatAttribute('callout', 'step', false)).toBe('step=false');
    expect(formatAttribute('callout', 'at', '50%,100%')).toBe('at=50%,100%');
  });

  it('quotes strings that would read as other types, or have spaces', () => {
    expect(formatAttribute('callout', 'label', '35')).toBe('label="35"');
    expect(formatAttribute('callout', 'label', 'true')).toBe('label="true"');
    expect(formatAttribute('callout', 'label', 'a b')).toBe('label="a b"');
    expect(formatAttribute('callout', 'label', '')).toBe('label=""');
    expect(formatAttribute('callout', 'label', 'say "hi"')).toBe(
      `label='say "hi"'`,
    );
  });

  it('keeps names of steps unquoted, which stay strings', () => {
    expect(formatAttribute('step', 'group', '1')).toBe('group=1');
  });

  it("refuses values that can't be written", () => {
    expect(() => formatAttribute('step', 'group', 1)).toThrow();
    expect(() => formatAttribute('callout', 'label', `"'`)).toThrow();
    expect(() => formatAttribute('callout', 'angle', Number.NaN)).toThrow();
    expect(() => formatAttribute('callout', 'a b', 1)).toThrow();
    expect(() => formatAttribute('callout', 'id', 'x')).toThrow();
  });
});

describe('editAttributes', () => {
  it('replaces values in place', () => {
    expect(edit(':callout[A]{for=arch angle=35 step}', { angle: 40 })).toBe(
      ':callout[A]{for=arch angle=40 step}',
    );
  });

  it('keeps how the other attributes are written', () => {
    expect(
      edit(`::callout[A]{ #id  for='arch'   angle = 35 }`, { angle: -90 }),
    ).toBe(`::callout[A]{ #id  for='arch'   angle = -90 }`);
  });

  it('adds attributes at the end', () => {
    expect(edit(':callout[A]{for=arch}', { angle: 40, offset: 60 })).toBe(
      ':callout[A]{for=arch angle=40 offset=60}',
    );
    expect(edit(':callout[A]{}', { angle: 40 })).toBe(':callout[A]{angle=40}');
  });

  it('adds braces after the label', () => {
    expect(edit(':callout[A [b]] text', { angle: 40 })).toBe(
      ':callout[A [b]]{angle=40} text',
    );
    expect(edit(':::column\nText', { grow: 2 })).toBe(
      ':::column{grow=2}\nText',
    );
  });

  it('removes attributes with the whitespace before them', () => {
    expect(edit(':callout[A]{for=arch angle=35 step}', { angle: null })).toBe(
      ':callout[A]{for=arch step}',
    );
    expect(edit(':callout[A]{angle=35 step}', { angle: null })).toBe(
      ':callout[A]{step}',
    );
    expect(edit(':callout[A]{for="a"angle=35}', { for: null })).toBe(
      ':callout[A]{angle=35}',
    );
  });

  it('removes the braces without attributes', () => {
    expect(edit(':callout[A]{ angle=35 } text', { angle: null })).toBe(
      ':callout[A] text',
    );
    expect(edit(':callout[A]{#id angle=35}', { angle: null })).toBe(
      ':callout[A]{#id}',
    );
  });

  it('sets the last of attributes of the same name, and removes the others', () => {
    expect(edit(':callout[A]{angle=1 for=x angle=2}', { angle: 3 })).toBe(
      ':callout[A]{for=x angle=3}',
    );
  });

  it('changes only what differs', () => {
    expect(editAttributes(':callout[A]{angle=35}', 0, { angle: 36 })).toEqual({
      start: 19,
      end: 20,
      text: '6',
    });
    expect(
      editAttributes(':callout[A]{angle=35}', 0, { angle: 35 }),
    ).toBeUndefined();
    expect(editAttributes(':callout[A]', 0, { angle: null })).toBeUndefined();
  });

  it("refuses what isn't a directive, or attributes that can't be read", () => {
    expect(() => editAttributes('text', 0, { angle: 1 })).toThrow();
    expect(() =>
      editAttributes(':callout[A]{angle=', 0, { angle: 1 }),
    ).toThrow();
  });
});

describe('readAttributes', () => {
  it('reads values as components get them, without ids and classes', () => {
    expect(
      readAttributes(`:callout[A]{#id .wide angle=35 label="35" step}`, 0),
    ).toEqual({
      name: 'callout',
      attributes: { angle: 35, label: '35', step: true },
    });
  });

  it("reads nothing where there's no directive that can be read", () => {
    expect(readAttributes('text', 0)).toBeUndefined();
    expect(readAttributes(':callout{angle=', 0)).toBeUndefined();
  });
});

describe('wrapInDirective', () => {
  it('writes the container around the directives, with more colons', () => {
    const source =
      'Text\n\n:::column\nA\n:::\n\n:::column\n::::step\nB\n::::\n:::\n';
    const start = source.indexOf(':::column');
    const end = source.lastIndexOf(':::') + 3;
    expect(
      apply(
        source,
        wrapInDirective(source, start, end, 'columns', { gap: 64 }),
      ),
    ).toBe(
      'Text\n\n:::::columns{gap=64}\n:::column\nA\n:::\n\n:::column\n::::step\nB\n::::\n:::\n:::::\n',
    );
  });

  it('writes it in block quotes, without empty braces', () => {
    const source = '> :::column\n> A\n> :::';
    expect(
      apply(
        source,
        wrapInDirective(source, 2, source.length, 'columns', { gap: null }),
      ),
    ).toBe('> ::::columns\n> :::column\n> A\n> :::\n> ::::');
  });

  it("refuses directives that don't start a line", () => {
    expect(() =>
      wrapInDirective('a :::column', 2, 11, 'columns', {}),
    ).toThrow();
  });
});
