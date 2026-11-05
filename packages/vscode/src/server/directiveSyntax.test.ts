import { describe, expect, it } from 'vitest';

import { readDirectiveSyntax } from './directiveSyntax.ts';

/** Returns the attributes of the directive at the start of `source` as text. */
function attributes(source: string) {
  return readDirectiveSyntax(source, 0).attributes.map(
    ({ name, nameStart, nameEnd, value, valueStart, valueEnd, quoted }) => ({
      name: source.slice(nameStart, nameEnd),
      parsed: name,
      value,
      raw: source.slice(valueStart, valueEnd),
      quoted,
    }),
  );
}

describe('readDirectiveSyntax', () => {
  it('finds the name after the colons', () => {
    const source = '::callout[Label]{for=arch}';
    const { nameStart, nameEnd, attributesEnd } = readDirectiveSyntax(
      source,
      0,
    );
    expect(source.slice(nameStart, nameEnd)).toBe('callout');
    expect(attributesEnd).toBe(source.length - 1);
  });

  it('reads attributes with offsets', () => {
    expect(
      attributes(
        `:callout[A [nested] label]{#id .wide for=arch angle = 35 label="Some text" title='x' step}`,
      ),
    ).toEqual([
      { name: '#', parsed: '#', value: 'id', raw: 'id', quoted: false },
      { name: '.', parsed: '.', value: 'wide', raw: 'wide', quoted: false },
      { name: 'for', parsed: 'for', value: 'arch', raw: 'arch', quoted: false },
      { name: 'angle', parsed: 'angle', value: '35', raw: '35', quoted: false },
      {
        name: 'label',
        parsed: 'label',
        value: 'Some text',
        raw: '"Some text"',
        quoted: true,
      },
      { name: 'title', parsed: 'title', value: 'x', raw: "'x'", quoted: true },
      {
        name: 'step',
        parsed: 'step',
        value: undefined,
        raw: '',
        quoted: false,
      },
    ]);
  });

  it('reads attributes over lines', () => {
    expect(attributes(':::callout{\n  for=arch\n  step\n}').length).toBe(2);
  });

  it('stops at invalid attributes', () => {
    const { attributes: read, attributesEnd } = readDirectiveSyntax(
      '::callout{for=arch =oops}',
      0,
    );
    expect(read.map(({ name }) => name)).toEqual(['for']);
    expect(attributesEnd).toBeUndefined();
  });

  it('has no attributes without braces', () => {
    expect(readDirectiveSyntax(':callout[Text] more', 0)).toMatchObject({
      attributes: [],
      attributesEnd: undefined,
    });
  });
});
