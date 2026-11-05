import type { Nodes } from 'mdast';
import type { CompileContext, Extension } from 'mdast-util-from-markdown';
import type { Processor } from 'unified';

import type { Attributes } from './directives.ts';
import { IMAGE_ATTRIBUTES } from './remarkHeadingAttributes.ts';

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

/** Attributes of steps that name groups or elements, like `group=1`. */
const STEP_NAMES = ['with', 'group', 'in', 'after', 'title', 'component'];

const STEP_BOUNDS = ['from', 'after', 'to', 'before'];

/**
 * Attributes of the directives of Seminar whose values stay strings, since
 * they're names or step paths, like `group=1` or `from=2`. The attribute
 * blocks of headings are `slide` directives.
 */
const STRING_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  step: new Set(STEP_NAMES),
  [IMAGE_ATTRIBUTES]: new Set(STEP_NAMES),
  slide: new Set([...STEP_BOUNDS, 'master', 'title', 'lang', 'steps']),
  recap: new Set([...STEP_BOUNDS, 'title']),
  include: new Set([...STEP_BOUNDS, 'title', 'lang']),
};

/**
 * Returns the value of the attribute `name` of the directive `directive`
 * written as `value`, like {@link attributeValue}, except that ids and
 * classes stay strings, and so do the names and step paths of the
 * directives of Seminar, like `:step{group=1}` or `::slide{from=2}`, and the
 * `split` of slides by step paths, like `split=1`.
 */
export function directiveAttributeValue(
  directive: string,
  name: string,
  value: string | undefined,
  quoted: boolean,
): AttributeValue {
  if (
    value !== undefined &&
    (name === 'id' ||
      name === 'class' ||
      name === 'className' ||
      (Object.hasOwn(STRING_ATTRIBUTES, directive) &&
        STRING_ATTRIBUTES[directive]?.has(name) === true))
  ) {
    return value;
  }
  const typed = attributeValue(value, quoted);
  return directive === 'slide' && name === 'split' && typeof typed === 'number'
    ? (value ?? '')
    : typed;
}

/**
 * Returns the value of the attribute `name` of a directive as its component
 * gets it, see {@link directiveAttributeValue}. Needs
 * {@link remarkDirectiveQuotes}.
 */
export function getAttributeValue(
  directive: Extract<Nodes, { type: `${string}Directive` }>,
  name: string,
): AttributeValue | undefined {
  const value = directive.attributes?.[name];
  return value === undefined || value === null
    ? undefined
    : directiveAttributeValue(
        directive.name,
        name,
        value,
        directive.data?.quotedAttributes?.includes(name) === true,
      );
}

/**
 * Returns the value of the attribute `name` of the directive `directive`
 * among its `attributes`, e.g., of `getAttributes`, see
 * {@link directiveAttributeValue}.
 */
export function attributeValueOf(
  directive: string,
  { attributes, quoted }: Attributes,
  name: string,
): AttributeValue | undefined {
  const value = attributes.get(name);
  return value === undefined
    ? undefined
    : directiveAttributeValue(
        directive,
        name,
        value,
        quoted?.has(name) === true,
      );
}
