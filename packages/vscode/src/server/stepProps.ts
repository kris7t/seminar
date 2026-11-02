import { bareAttributeWords } from '@seminar/mdx/syntax';
import type { Code, Nodes } from 'mdast';
import type { ContainerDirective, TextDirective } from 'mdast-util-directive';

/** A bare word among the props of something that can be a step. */
export interface BareProp {
  word: string;
  /** Offset of the word in the deck. */
  offset: number;
}

type Directive = ContainerDirective | TextDirective;

/**
 * Directives that aren't components, where bare words don't make steps. Headings
 * also become `slide`, and their bare words are masters.
 */
const NOT_COMPONENTS: ReadonlySet<string> = new Set([
  'include',
  'notes',
  'recap',
  'slide',
]);

const DIRECTIVE_NAME = /:*[^\s[{]*/y;

const ATTRIBUTE_BLOCK = /\{((?:"[^"]*"|'[^']*'|[^{}"'])*)\}/dy;

/** Matches the comments of steps in diagrams, see `plugin-pele`. */
const MERMAID_STEP = /^[> \t]*%%[ \t]*step(?:\[[^\]\r\n]*\])?[ \t]+(.*)$/dgm;

/** Returns the offset after the label of a directive at `offset`, if any. */
function skipLabel(source: string, offset: number): number {
  if (source[offset] !== '[') {
    return offset;
  }
  let depth = 0;
  for (let index = offset; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
    } else if (source[index] === '[') {
      depth += 1;
    } else if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return source.length;
}

function wordsAt(text: string, offset: number): BareProp[] {
  return bareAttributeWords(text).map(({ word, index }) => ({
    word,
    offset: offset + index,
  }));
}

function directiveProps(source: string, node: Directive): BareProp[] {
  const start = node.position?.start.offset;
  if (start === undefined || NOT_COMPONENTS.has(node.name)) {
    return [];
  }
  DIRECTIVE_NAME.lastIndex = start;
  DIRECTIVE_NAME.exec(source);
  ATTRIBUTE_BLOCK.lastIndex = skipLabel(source, DIRECTIVE_NAME.lastIndex);
  const block = ATTRIBUTE_BLOCK.exec(source);
  const inner = block?.indices?.[1];
  return block?.[1] === undefined || inner === undefined
    ? []
    : wordsAt(block[1], inner[0]);
}

function codeProps(source: string, node: Code): BareProp[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    return [];
  }
  const text = source.slice(start, end);
  const props: BareProp[] = [];
  const meta = node.meta ?? '';
  const index = /^.*/.exec(text)?.[0].lastIndexOf(meta) ?? -1;
  if (meta !== '' && index !== -1) {
    props.push(...wordsAt(meta, start + index));
  }
  if (node.lang?.toLowerCase() === 'mermaid') {
    for (const match of text.matchAll(MERMAID_STEP)) {
      const inner = match.indices?.[1];
      if (match[1] !== undefined && inner !== undefined) {
        props.push(...wordsAt(match[1], start + inner[0]));
      }
    }
  }
  return props;
}

/**
 * Returns the bare words among the props of the directives, images, and code
 * blocks in the tree of a deck, and the comments of steps in its diagrams.
 */
export function findBareProps(source: string, node: Nodes): BareProp[] {
  const own =
    node.type === 'code'
      ? codeProps(source, node)
      : node.type === 'containerDirective' ||
          node.type === 'leafDirective' ||
          node.type === 'textDirective'
        ? directiveProps(source, node as Directive)
        : [];
  return 'children' in node
    ? [
        ...own,
        ...node.children.flatMap((child) => findBareProps(source, child)),
      ]
    : own;
}
