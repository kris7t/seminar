import { compile } from '@mdx-js/mdx';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';

import type {
  CodeBlock,
  CodeBlockResult,
  LoadedCodeBlock,
} from '../config/codeBlocks.ts';
import { emptyMdxPlugins } from '../config/deckSetup.ts';
import { seminarMdxOptions } from '../options.ts';

async function compileDeck(
  source: string,
  codeBlocks?: Record<string, LoadedCodeBlock>,
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

/** A registration whose handler records the blocks it gets. */
function recording(
  exportName: string,
  render: (block: CodeBlock) => CodeBlockResult | undefined,
  blocks: CodeBlock[] = [],
): LoadedCodeBlock {
  return {
    handler: () => (block) => {
      blocks.push(block);
      return render(block);
    },
    component: { source: 'blocks', exportName },
  };
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
          'Graph',
          ({ code: source }) => ({
            props: { source, options: { layout: 'dot' } },
            imports: { engine: { source: 'engines', exportName: 'default' } },
          }),
          blocks,
        ),
        '*': recording('Code', ({ lang }) => ({ props: { lang } }), blocks),
      },
    );
    expect(blocks.map(({ lang, meta }) => [lang, meta])).toEqual([
      ['dot', '{x}'],
      ['ts', undefined],
      [undefined, undefined],
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
      dot: recording('Graph', () => undefined),
      '*': {
        handler: () => () => {
          throw new Error('Broken');
        },
        component: { source: 'blocks', exportName: 'Code' },
      },
    });
    expect(messages).toEqual(['Cannot render the code block: Error: Broken']);
    expect(code).toContain('CodeBlock as _SeminarCode0');
    expect(code).not.toContain('from "blocks"');
  });

  it('ignores attributes that handlers set', async () => {
    const { code, messages } = await compileDeck(
      '```dot source=x step\ngraph\n```',
      { dot: recording('Graph', () => ({ props: { source: 'graph' } })) },
    );
    expect(messages).toEqual([
      'Ignoring `source` on the code block, which its handler sets',
    ]);
    expect(code).toContain('source: "graph"');
    expect(code).not.toContain('source: "x"');
    expect(code).toContain('step: true');
  });

  it('leaves display math alone', async () => {
    const { code } = await compileDeck('$$\nx\n$$', {
      '*': recording('Code', () => ({})),
    });
    expect(code).not.toContain('import {Code');
    expect(code).toContain('math-display');
  });
});
