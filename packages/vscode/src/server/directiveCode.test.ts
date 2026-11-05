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

const CODE_BLOCKS = {
  '*': { source: '@seminar/plugin-shiki/code', exportName: 'shikiCodeBlocks' },
  dot: { source: 'graphs/code', exportName: 'graphCodeBlocks' },
  mermaid: {
    source: '@seminar/plugin-pele/code',
    exportName: 'peleCodeBlocks',
  },
};

/** The type that the generated code gives the props of `handler`. */
function handlerProps(source: string, exportName: string): string {
  return `Parameters<ReturnType<typeof import("${source}").${exportName}>>[0]["props"]`;
}

/** Leaves out the imports for the documentation of directives. */
function withoutDocumented(text: string): string {
  return text.replace(
    /^import type \{ \w+ as _SeminarDocumented\d+ \}.*\n/gm,
    '',
  );
}

function generate(
  source: string,
  options: {
    codeBlocks?: Parameters<typeof generateDirectiveCode>[3];
  } = { codeBlocks: CODE_BLOCKS },
) {
  const root = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins([]))
    .parse(source);
  const code = generateDirectiveCode(
    source,
    root,
    DIRECTIVES,
    options.codeBlocks,
  );
  return { ...code, text: withoutDocumented(code.text) };
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

  it('renders the directives of Seminar with the types of their attributes', () => {
    expect(
      generate(`# Title {#intro .wide section spare from=2}

A :step{only fade=300} and ![Diagram](d.svg){width=600}

::recap[#intro]{to=1}

::include[./other.deck.mdx]{copy}

:::notes
Note
:::
`).text,
    )
      .toBe(`declare function _SeminarSlideDirective(props: import("@seminar/core").SlideDirectiveAttributes): null;
declare function _SeminarStepDirective(props: import("@seminar/core").StepDirectiveAttributes): null;
declare function _SeminarImageDirective(props: import("@seminar/core").ImageDirectiveAttributes): null;
declare function _SeminarRecapDirective(props: import("@seminar/core").RecapDirectiveAttributes): null;
declare function _SeminarIncludeDirective(props: import("@seminar/core").IncludeDirectiveAttributes): null;
declare function _SeminarNotesDirective(props: import("@seminar/core").NotesDirectiveAttributes): null;
<_SeminarSlideDirective id={"intro"} section spare from={"2"} />;
<_SeminarStepDirective only fade={300} />;
<_SeminarImageDirective width={600} />;
<_SeminarRecapDirective to={"1"} />;
<_SeminarIncludeDirective copy />;
<_SeminarNotesDirective />;
export {};
`);
  });

  it('renders the steps of diagrams with the types of their props', () => {
    const source =
      '```mermaid\nflowchart LR\n  %% step only group=1\n  A --> B\n  %% step[B] #b fade=300 .x\n```\n';
    expect(generate(source).text).toBe(
      `declare function _SeminarCodeBlock0(props: ${handlerProps('@seminar/plugin-pele/code', 'peleCodeBlocks')}): null;
declare function _SeminarDiagramStep(props: import("@seminar/plugin-pele").DiagramStepProps): null;
<_SeminarCodeBlock0 />;
<_SeminarDiagramStep only group={"1"} />;
<_SeminarDiagramStep id={"b"} fade={300} />;
export {};
`,
    );
    expect(mapped(source)).toEqual([
      ['mermaid', '_SeminarCodeBlock0'],
      ['', ''],
      ['step', '_SeminarDiagramStep'],
      ['only', 'only'],
      ['group', 'group'],
      ['1', '{"1"}'],
      ['', ''],
      ['step', '_SeminarDiagramStep'],
      ['#', 'id'],
      ['b', '{"b"}'],
      ['fade', 'fade'],
      ['300', '{300}'],
      ['', ''],
    ]);
  });

  it('renders the attributes of code blocks with their components', () => {
    const source =
      '```ts #fib {1-3} step group=1 .wide\ncode\n```\n\n```dot width=3\ngraph\n```\n\n```\nplain\n```\n';
    expect(generate(source).text).toBe(
      `declare function _SeminarCodeBlock0(props: ${handlerProps('@seminar/plugin-shiki/code', 'shikiCodeBlocks')}): null;
declare function _SeminarCodeBlock1(props: ${handlerProps('graphs/code', 'graphCodeBlocks')}): null;
<_SeminarCodeBlock0 id={"fib"} step group={"1"} />;
<_SeminarCodeBlock1 width={3} />;
export {};
`,
    );
    expect(
      generate('```ts step\ncode\n```', { codeBlocks: {} }).text,
    ).toContain('import("@seminar/core").CodeBlockAttributes');
    expect(generate('```ts step\ncode\n```', {}).text).toBe('export {};\n');
    expect(mapped('```ts step\ncode\n```')).toEqual([
      ['ts', '_SeminarCodeBlock0'],
      ['step', 'step'],
      ['', ''],
    ]);
  });

  it('imports the directives for their documentation', () => {
    const root = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(deckSyntaxPlugins([]))
      .parse('');
    const { text, documented } = generateDirectiveCode('', root, DIRECTIVES);
    expect(documented).toEqual({
      step: '_SeminarDocumented0',
      slide: '_SeminarDocumented1',
      recap: '_SeminarDocumented2',
      include: '_SeminarDocumented3',
      notes: '_SeminarDocumented4',
      callout: '_SeminarDocumented5',
      column: '_SeminarDocumented6',
    });
    expect(text).toContain(
      'import type { StepDirectiveAttributes as _SeminarDocumented0 } from "@seminar/core";\n',
    );
    expect(text).toContain(
      'import type { CalloutDirective as _SeminarDocumented5 } from "@seminar/elements";\n',
    );
    expect(text).toMatch(
      /_SeminarDocumented6 } from "\.\/Column\.tsx";\nexport \{\};\n$/,
    );
  });

  it('maps the attributes of headings to the deck', () => {
    expect(mapped('## Title {#a steps=dim}')).toEqual([
      ['', '_SeminarSlideDirective'],
      ['#', 'id'],
      ['a', '{"a"}'],
      ['steps', 'steps'],
      ['dim', '{"dim"}'],
      ['', ''],
    ]);
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
