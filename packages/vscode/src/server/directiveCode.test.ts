import { deckSyntaxPlugins } from '@seminar/mdx/syntax';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { generateDirectiveCode } from './directiveCode.ts';

const DIRECTIVES = {
  callout: {
    source: '@seminar/elements',
    exportName: 'CalloutDirective',
    formProp: 'directive',
    labelProp: 'label',
  },
  column: { source: './Column.tsx', exportName: 'Column' },
};

function generate(source: string) {
  const root = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins([]))
    .parse(source);
  return generateDirectiveCode(source, root, DIRECTIVES);
}

/** Returns what of the generated code maps to which source. */
function mapped(source: string) {
  const { text, mappings } = generate(source);
  return mappings.map(
    ({ sourceOffsets, generatedOffsets, lengths, generatedLengths }) => [
      source.slice(
        sourceOffsets[0],
        (sourceOffsets[0] ?? 0) + (lengths[0] ?? 0),
      ),
      text.slice(
        generatedOffsets[0],
        (generatedOffsets[0] ?? 0) + (generatedLengths?.[0] ?? lengths[0] ?? 0),
      ),
    ],
  );
}

describe('generateDirectiveCode', () => {
  it('renders directives with components as JSX', () => {
    expect(
      generate(`# Slide

:::callout[Title]{#note .wide for=arch angle=35 step}
Text
:::

::column

A :callout[remark]{shift="0,-8"} and an :unknown[directive].
`).text,
    )
      .toBe(`import { CalloutDirective as _SeminarDirective0 } from "@seminar/elements";
import { Column as _SeminarDirective1 } from "./Column.tsx";
<_SeminarDirective0 directive="container" label="" id={"note"} for={"arch"} angle={35} step children={null!} />;
<_SeminarDirective1 />;
<_SeminarDirective0 directive="text" shift={"0,-8"} children={null!} />;
export {};
`);
  });

  it('maps names and values to the deck', () => {
    expect(mapped('::callout[Text]{#note for=arch angle=35 step}')).toEqual([
      ['callout', '_SeminarDirective0'],
      ['#', 'id'],
      ['note', '{"note"}'],
      ['for', 'for'],
      ['arch', '{"arch"}'],
      ['angle', 'angle'],
      ['35', '{35}'],
      ['step', 'step'],
      ['', ''],
    ]);
  });

  it('maps the end of the attributes to where new ones are completed', () => {
    const source = '::callout[Text]{for=arch}';
    const { text, mappings } = generate(source);
    const completed = mappings.filter(
      ({ sourceOffsets: [offset], lengths: [length], data }) =>
        offset !== undefined &&
        length !== undefined &&
        offset <= source.length - 1 &&
        source.length - 1 <= offset + length &&
        data.completion === true,
    );
    expect(completed).toHaveLength(1);
    expect(text.slice(completed[0]?.generatedOffsets[0])).toMatch(/^\/>;/);
  });
});
