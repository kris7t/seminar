import { bareAttributeWords } from '@seminar/mdx/syntax';
import type { Code, Nodes } from 'mdast';
import type { ContainerDirective, TextDirective } from 'mdast-util-directive';

import { skipLabel } from './directiveSyntax.ts';

/**
 * A bare word among the props of something that can be a step, which may be a
 * step behavior, or among the attributes of a slide, which may be a master.
 */
export interface BareProp {
  word: string;
  /** Offset of the word in the deck. */
  offset: number;
  /** Whether the word is among the attributes of a slide. */
  slide: boolean;
}

type Directive = ContainerDirective | TextDirective;

/** Directives that aren't components, where bare words don't make steps. */
const NOT_COMPONENTS: ReadonlySet<string> = new Set([
  'include',
  'notes',
  'recap',
]);

/** The directive of slides, which headings with attributes also become. */
const SLIDE = 'slide';

const DIRECTIVE_NAME = /:*[^\s[{]*/y;

const ATTRIBUTE_BLOCK = /\{((?:"[^"]*"|'[^']*'|[^{}"'])*)\}/dy;

/** Matches the comments of steps in diagrams, see `plugin-pele`. */
const MERMAID_STEP = /^[> \t]*%%[ \t]*step(?:\[[^\]\r\n]*\])?[ \t]+(.*)$/dgm;

function wordsAt(text: string, offset: number, slide = false): BareProp[] {
  return bareAttributeWords(text).map(({ word, index }) => ({
    word,
    offset: offset + index,
    slide,
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
    : wordsAt(block[1], inner[0], node.name === SLIDE);
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
 * blocks in the tree of a deck, and the comments of steps in its diagrams, and
 * among the attributes of its slides.
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
