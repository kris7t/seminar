import type { Root } from 'mdast';
import type { Node, Position } from 'unist';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified, type PluggableList } from 'unified';
import { describe, expect, it } from 'vitest';

import { deckSyntaxPlugins } from './syntax.ts';

function parse(source: string, plugins: PluggableList = []): Root {
  return unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(deckSyntaxPlugins(plugins))
    .parse(source);
}

function find(node: Node, type: string): (Node & Record<string, unknown>)[] {
  const children = (node as { children?: Node[] }).children ?? [];
  return [
    ...(node.type === type ? [node as Node & Record<string, unknown>] : []),
    ...children.flatMap((child) => find(child, type)),
  ];
}

function sliceOf(source: string, position: Position | undefined) {
  return source.slice(position?.start.offset, position?.end.offset);
}

const DECK = `---
theme: x
---

import { value } from './value.ts';

## First {#first}

:step Some {value.alpha} text

## Second {#second .wide}

![Image](./a.svg){#image} {value.beta}

<Foo bar={value.gamma} />
`;

describe('deckSyntaxPlugins', () => {
  it('parses attribute blocks of headings and images, and directives', () => {
    const tree = parse(DECK);
    expect(find(tree, 'mdxTextExpression').length).toBe(2);
    expect(find(tree, 'yaml').length).toBe(1);
    expect(find(tree, 'textDirective').map((node) => node['name'])).toEqual([
      'slide',
      'step',
      'slide',
      'seminar-attributes',
    ]);
  });

  it('keeps nodes after rewritten attribute blocks at their source', () => {
    const tree = parse(DECK);
    expect(
      find(tree, 'mdxTextExpression').map((node) =>
        sliceOf(DECK, node.position),
      ),
    ).toEqual(['{value.alpha}', '{value.beta}']);
    expect(sliceOf(DECK, find(tree, 'mdxjsEsm')[0]?.position)).toBe(
      "import { value } from './value.ts';",
    );
    expect(sliceOf(DECK, find(tree, 'mdxJsxFlowElement')[0]?.position)).toBe(
      '<Foo bar={value.gamma} />',
    );
  });

  it('keeps the columns of nodes on rewritten lines', () => {
    const tree = parse(DECK);
    const beta = find(tree, 'mdxTextExpression')[1];
    expect(beta?.position?.start.column).toBe(
      '![Image](./a.svg){#image} '.length + 1,
    );
  });

  it('keeps the JavaScript in expressions at its source', () => {
    const tree = parse(DECK);
    const element = find(tree, 'mdxJsxFlowElement')[0] as unknown as {
      attributes: {
        value: {
          data: {
            estree: {
              start: number;
              end: number;
              range: [number, number];
              loc: { start: { line: number; column: number } };
            };
          };
        };
      }[];
    };
    const estree = element.attributes[0]?.value.data.estree;
    expect(estree).toBeDefined();
    if (estree !== undefined) {
      expect(DECK.slice(estree.start, estree.end)).toBe('value.gamma');
      expect(DECK.slice(...estree.range)).toBe('value.gamma');
      expect(estree.loc.start.column).toBe('<Foo bar={'.length);
    }
  });

  it('keeps parse errors after attribute blocks at their source', () => {
    const source = '## First {#first}\n\n## Second {#second} {#broken} text\n';
    expect(() => parse(source)).toThrow(
      expect.objectContaining({
        line: 3,
        place: expect.objectContaining({
          offset: source.indexOf('{#second}') + 1,
        }) as unknown,
      }),
    );
  });
});
