import type { DirectiveForm } from '@seminar/mdx/syntax';
import type { Nodes, Root } from 'mdast';

import type { DirectiveComponent } from './directiveLoader.ts';
import { readDirectiveSyntax } from './directiveSyntax.ts';

/** A directive that Seminar handles itself. */
interface BuiltInDirective {
  forms: readonly DirectiveForm[];
  /** Whether it needs content, a label in its forms. */
  content?: boolean;
}

const BUILT_IN: Readonly<Record<string, BuiltInDirective>> = {
  step: {
    forms: ['text', 'leaf', 'container'],
  },
  slide: {
    forms: ['leaf'],
  },
  recap: {
    forms: ['leaf'],
    content: true,
  },
  include: {
    forms: ['leaf'],
    content: true,
  },
  notes: {
    forms: ['container'],
  },
};

/** Nodes whose content is never a directive. */
const NOT_MARKDOWN: ReadonlySet<string> = new Set([
  'code',
  'inlineCode',
  'math',
  'inlineMath',
  'yaml',
  'toml',
  'html',
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxTextExpression',
]);

/** A directive name that can be written where it's completed. */
export interface DirectiveNameItem {
  name: string;
  /** The text that replaces the name, a snippet. */
  insertText: string;
  /** Where the component comes from, or that Seminar handles it. */
  detail: string;
  builtIn: boolean;
}

/** The names of directives that can be completed at an offset. */
export interface DirectiveNameCompletion {
  /** Offsets of the name that the items replace. */
  start: number;
  end: number;
  items: DirectiveNameItem[];
}

/** Matches the colons of leaf and container directives that start a line. */
const BLOCK = /^((?:[ \t]*>)*[ \t]*)(:{2,})([A-Za-z][\w-]*)?$/;

/** Matches the colon of a text directive, which can't follow a colon. */
const TEXT = /(^|[^:\\]):([A-Za-z][\w-]*)?$/;

/** Matches where a word starts, before the colon of a text directive. */
const WORD_START = /^$|[\s([{"'*_~]$/;

/** Returns the nodes at `offset`, from the root to the innermost. */
function nodesAt(node: Nodes, offset: number): Nodes[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    return [];
  }
  if (offset <= start || offset > end) {
    return [];
  }
  if ('children' in node) {
    for (const child of node.children) {
      const inner = nodesAt(child, offset);
      if (inner.length > 0) {
        return [node, ...inner];
      }
    }
  }
  return [node];
}

/** Whether a directive can be written at `offset` of the deck `source`. */
function inMarkdown(source: string, root: Root, offset: number): boolean {
  const nodes = nodesAt(root, offset);
  if (nodes.some(({ type }) => NOT_MARKDOWN.has(type))) {
    return false;
  }
  const innermost = nodes.at(-1);
  // The types of MDX aren't among those of `mdast` here.
  const type: string | undefined = innermost?.type;
  if (type === 'mdxJsxFlowElement' || type === 'mdxJsxTextElement') {
    // In the tag, not in the content.
    return false;
  }
  if (
    type === 'textDirective' ||
    type === 'leafDirective' ||
    type === 'containerDirective'
  ) {
    // In the name, not in the label or the attributes.
    return (
      offset <=
      readDirectiveSyntax(source, innermost?.position?.start.offset ?? 0)
        .nameEnd
    );
  }
  return true;
}

/** The closing fence of a container directive, on a line of its own. */
interface Fence {
  /** The indentation and the `>` of block quotes before the colons. */
  prefix: string;
  colons: string;
}

/**
 * Returns the snippet of the directive `name` in `form`: with the label of
 * text and leaf directives that need content, and with the closing `fence` of
 * container directives.
 */
function insertText(
  name: string,
  form: DirectiveForm,
  content: boolean | undefined,
  fence: Fence | undefined,
): string {
  if (form === 'container') {
    return fence === undefined
      ? name
      : `${name}\n${fence.prefix}$0\n${fence.prefix}${fence.colons}`;
  }
  return content === true ? `${name}[$1]` : name;
}

/**
 * Whether the container directive at `offset` is closed by a fence of exactly
 * `colons`, e.g., when its name is changed, rather than by the fence of a
 * container around it.
 */
function isClosed(
  source: string,
  root: Root,
  offset: number,
  colons: string,
): boolean {
  const container = nodesAt(root, offset).findLast(
    ({ type }) => type === 'containerDirective',
  );
  const start = container?.position?.start.offset;
  const end = container?.position?.end.offset;
  if (start === undefined || end === undefined) {
    return false;
  }
  const last = /[^\r\n]*$/.exec(source.slice(start, end))?.[0] ?? '';
  return /^(?:[ \t]*>)*[ \t]*(:+)[ \t]*$/.exec(last)?.[1] === colons;
}

/**
 * Returns the names of the directives that can be completed at `offset` of
 * the deck `source`, as the colons before it tell the form: the directives of
 * Seminar in the forms that they're written in, and the directives that have
 * components in `directives`, in the forms that they declare, or else any.
 * Text and leaf directives that need content are completed with a label.
 *
 * Text directives are completed after a colon that doesn't follow a colon,
 * like the parser reads them, e.g., `this:callout`, but right after the
 * colon only at the start of a word, unless `invoked`, so that the colons of
 * text, like in `Note:`, don't open a list. Leaf and container directives
 * are completed after the colons that start a line. Container directives,
 * when nothing follows on the line, are completed with a closing fence of as
 * many colons, unless they have one.
 */
export function completeDirectiveName(
  source: string,
  root: Root,
  offset: number,
  directives: Readonly<Record<string, DirectiveComponent>>,
  invoked: boolean,
): DirectiveNameCompletion | undefined {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const before = source.slice(lineStart, offset);
  const rest = /^[^\r\n]*/.exec(source.slice(offset))?.[0] ?? '';
  const nameRest = /^[\w-]*/.exec(rest)?.[0] ?? '';
  const block = BLOCK.exec(before);
  const text = block === null ? TEXT.exec(before) : null;
  let form: DirectiveForm;
  let typed: string;
  let fence: Fence | undefined;
  if (block !== null) {
    const [, prefix = '', colons = '', name = ''] = block;
    form = colons.length === 2 ? 'leaf' : 'container';
    typed = name;
    if (
      form === 'container' &&
      rest.slice(nameRest.length).trim() === '' &&
      !isClosed(source, root, offset, colons)
    ) {
      fence = { prefix, colons };
    }
  } else if (text !== null) {
    const [, previous = '', name = ''] = text;
    if (name === '' && !invoked && !WORD_START.test(previous)) {
      return undefined;
    }
    form = 'text';
    typed = name;
  } else {
    return undefined;
  }
  if (!inMarkdown(source, root, offset)) {
    return undefined;
  }
  const items: DirectiveNameItem[] = [];
  for (const [name, directive] of Object.entries(BUILT_IN)) {
    if (directive.forms.includes(form)) {
      items.push({
        name,
        insertText: insertText(name, form, directive.content, fence),
        detail: 'Seminar',
        builtIn: true,
      });
    }
  }
  for (const [
    name,
    { source: module, exportName, forms, content },
  ] of Object.entries(directives)) {
    if (
      !Object.hasOwn(BUILT_IN, name) &&
      (forms === undefined || forms.includes(form))
    ) {
      items.push({
        name,
        insertText: insertText(name, form, content, fence),
        detail: `${exportName} from ${module}`,
        builtIn: false,
      });
    }
  }
  return {
    start: offset - typed.length,
    end: offset + nameRest.length,
    items,
  };
}
