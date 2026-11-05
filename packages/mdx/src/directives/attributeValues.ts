import type { Nodes } from 'mdast';
import type { CompileContext, Extension } from 'mdast-util-from-markdown';
import type { Processor } from 'unified';

import type { Attributes } from './directives.ts';

/** The value of an attribute as a component gets it, see {@link attributeValue}. */
export type AttributeValue = string | number | boolean;

declare module 'mdast-util-directive' {
  interface ContainerDirectiveData {
    /** The attributes whose values are quoted, see {@link getAttributeValue}. */
    quotedAttributes?: string[] | undefined;
  }
  interface LeafDirectiveData {
    /** The attributes whose values are quoted, see {@link getAttributeValue}. */
    quotedAttributes?: string[] | undefined;
  }
  interface TextDirectiveData {
    /** The attributes whose values are quoted, see {@link getAttributeValue}. */
    quotedAttributes?: string[] | undefined;
  }
}

const DIRECTIVE_TYPES: ReadonlySet<string> = new Set([
  'containerDirective',
  'leafDirective',
  'textDirective',
]);

/** Tells the directive being parsed that its last attribute is quoted. */
function enterValueMarker(this: CompileContext): undefined {
  const attributes = (
    this.data as { directiveAttributes?: [string, string][] | undefined }
  ).directiveAttributes;
  const name = attributes?.at(-1)?.[0];
  const node = this.stack.findLast(({ type }) => DIRECTIVE_TYPES.has(type)) as
    Extract<Nodes, { type: `${string}Directive` }> | undefined;
  if (name === undefined || node === undefined) {
    return;
  }
  node.data ??= {};
  const quoted = (node.data.quotedAttributes ??= []);
  if (!quoted.includes(name)) {
    quoted.push(name);
  }
}

const fromMarkdown: Extension = {
  enter: {
    directiveContainerAttributeValueMarker: enterValueMarker,
    directiveLeafAttributeValueMarker: enterValueMarker,
    directiveTextAttributeValueMarker: enterValueMarker,
  },
};

/**
 * Remembers which attributes of directives have quoted values, which
 * {@link getAttributeValue} reads as strings. Must be used with
 * `remark-directive`.
 */
export function remarkDirectiveQuotes(this: Processor): undefined {
  const data = this.data();
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Returns the value of an attribute of a directive written as `value`: `true`
 * without a value, a number or a boolean if it looks like one and isn't
 * quoted, and a string otherwise, e.g., `{angle=35 label="35" step}` for
 * `angle={35} label="35" step={true}` in JSX.
 */
export function attributeValue(
  value: string | undefined,
  quoted: boolean,
): AttributeValue {
  if (value === undefined || (value === '' && !quoted)) {
    return true;
  }
  if (quoted) {
    return value;
  }
  if (NUMBER.test(value)) {
    return Number(value);
  }
  return value === 'true' ? true : value === 'false' ? false : value;
}

/**
 * Returns the value of the attribute `name` of a directive as its component
 * gets it, see {@link attributeValue}. Needs {@link remarkDirectiveQuotes}.
 */
export function getAttributeValue(
  directive: Extract<Nodes, { type: `${string}Directive` }>,
  name: string,
): AttributeValue | undefined {
  const value = directive.attributes?.[name];
  return value === undefined || value === null
    ? undefined
    : attributeValue(
        value,
        directive.data?.quotedAttributes?.includes(name) === true,
      );
}

/**
 * Returns the value of the attribute `name` among `attributes`, e.g., of
 * `getAttributes`, as a component gets it, see {@link attributeValue}.
 */
export function attributeValueOf(
  { attributes, quoted }: Attributes,
  name: string,
): AttributeValue | undefined {
  const value = attributes.get(name);
  return value === undefined
    ? undefined
    : attributeValue(value, quoted?.has(name) === true);
}
