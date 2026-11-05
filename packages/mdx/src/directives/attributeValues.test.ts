import type { Nodes } from 'mdast';
import { describe, expect, it } from 'vitest';

import { parseDeck } from '../deck/frontmatter.ts';
import { attributeValue, getAttributeValue } from './attributeValues.ts';

type Directive = Extract<Nodes, { type: `${string}Directive` }>;

function directives(node: Nodes): Directive[] {
  const own = node.type.endsWith('Directive') ? [node as Directive] : [];
  return 'children' in node
    ? [...own, ...node.children.flatMap(directives)]
    : own;
}

describe('attributeValue', () => {
  it('reads values like JSX would have them', () => {
    expect(attributeValue(undefined, false)).toBe(true);
    expect(attributeValue('', false)).toBe(true);
    expect(attributeValue('', true)).toBe('');
    expect(attributeValue('35', false)).toBe(35);
    expect(attributeValue('-0.5', false)).toBe(-0.5);
    expect(attributeValue('1e3', false)).toBe(1000);
    expect(attributeValue('35', true)).toBe('35');
    expect(attributeValue('false', false)).toBe(false);
    expect(attributeValue('true', true)).toBe('true');
    expect(attributeValue('30%,40%', false)).toBe('30%,40%');
  });
});

describe('getAttributeValue', () => {
  it('reads quoted values as strings in all forms of directives', () => {
    const { tree } = parseDeck(
      `:a[x]{n=1 q="1"}\n\n::b{n=1 q='1'}\n\n:::c{n=1 q="1"}\nText\n:::`,
    );
    expect(
      directives(tree).map((directive) => [
        directive.name,
        getAttributeValue(directive, 'n'),
        getAttributeValue(directive, 'q'),
        getAttributeValue(directive, 'missing'),
      ]),
    ).toEqual([
      ['a', 1, '1', undefined],
      ['b', 1, '1', undefined],
      ['c', 1, '1', undefined],
    ]);
  });
});
