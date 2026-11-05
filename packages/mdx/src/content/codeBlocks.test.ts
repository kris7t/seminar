import { compile } from '@mdx-js/mdx';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';

import type {
  CodeBlock,
  CodeBlockHandlerFactory,
  CodeBlockResult,
} from '../config/codeBlocks.ts';
import { emptyMdxPlugins } from '../config/deckSetup.ts';
import { seminarMdxOptions } from '../options.ts';

async function compileDeck(
  source: string,
  codeBlocks?: Record<string, CodeBlockHandlerFactory>,
) {
  const mdxPlugins = emptyMdxPlugins();
  mdxPlugins.remarkPlugins.before.push(remarkMath);
  const file = await compile(source, {
    ...seminarMdxOptions({ codeBlocks, mdxPlugins }),
  });
  return {
    code: String(file),
    messages: file.messages.map(({ reason }) => reason),
  };
}

/** A handler that records the blocks it gets. */
function recording(
  render: (block: CodeBlock) => CodeBlockResult | undefined,
  blocks: CodeBlock[] = [],
): CodeBlockHandlerFactory {
  return () => (block) => {
    blocks.push(block);
    return render(block);
  };
}

/** The component `exportName` of the module `blocks`. */
function component(exportName: string) {
  return { source: 'blocks', exportName };
}

describe('rehypeCodeBlocks', () => {
  it('renders blocks without handlers with the CodeBlock of core', async () => {
    const { code } = await compileDeck('```ts #fib step {1-3}\nx\n```');
    expect(code).toContain(
      'import {CodeBlock as _SeminarCode0} from "@seminar/core";',
    );
    expect(code).toContain('lang: "ts"');
    expect(code).toContain('meta: "{1-3}"');
    expect(code).toContain('code: "x"');
    expect(code).toContain('id: "fib"');
    expect(code).toContain('step: true');
  });

  it('gives blocks to the handler of their language, or else of *', async () => {
    const blocks: CodeBlock[] = [];
    const { code } = await compileDeck(
      '```dot width=2 {x}\ngraph\n```\n\n```ts\nx\n```\n\n```\nplain\n```',
      {
        dot: recording(
          ({ code: source, props }) => ({
            component: component('Graph'),
            props: { ...props, source, options: { layout: 'dot' } },
            imports: { engine: { source: 'engines', exportName: 'default' } },
          }),
          blocks,
        ),
        '*': recording(
          ({ lang }) => ({ component: component('Code'), props: { lang } }),
          blocks,
        ),
      },
    );
    expect(blocks.map(({ lang, meta, props }) => [lang, meta, props])).toEqual([
      ['dot', '{x}', { width: 2 }],
      ['ts', undefined, {}],
      [undefined, undefined, {}],
    ]);
    expect(code).toContain('import {Graph as _SeminarCode0} from "blocks";');
    expect(code).toContain('import {default as _SeminarCode1} from "engines";');
    expect(code).toContain('import {Code as _SeminarCode2} from "blocks";');
    expect(code).toMatch(/options: \{\s*"layout": "dot"\s*\}/);
    expect(code).toContain('engine: _SeminarCode1');
    expect(code).toContain('width: 2');
    expect(code.match(/_SeminarCode2, \{/g)).toHaveLength(2);
  });

  it('leaves blocks that handlers return nothing for to the next', async () => {
    const { code, messages } = await compileDeck('```dot\ngraph\n```', {
      dot: recording(() => undefined),
      '*': () => () => {
        throw new Error('Broken');
      },
    });
    expect(messages).toEqual(['Cannot render the code block: Error: Broken']);
    expect(code).toContain('CodeBlock as _SeminarCode0');
    expect(code).not.toContain('from "blocks"');
  });

  it('gives handlers the attributes parsed like those of :step', async () => {
    const blocks: CodeBlock[] = [];
    await compileDeck(
      '```dot #g .wide step with=parent fade=300 {1}\ngraph\n```',
      {
        dot: recording(() => undefined, blocks),
      },
    );
    expect(blocks.map(({ props }) => props)).toEqual([
      {
        with: 'parent',
        id: 'g',
        className: 'wide',
        step: true,
        fade: 300,
      },
    ]);
  });

  it('leaves display math alone', async () => {
    const { code } = await compileDeck('$$\nx\n$$', {
      '*': recording(() => ({ component: component('Code') })),
    });
    expect(code).not.toContain('import {Code');
    expect(code).toContain('math-display');
  });
});
