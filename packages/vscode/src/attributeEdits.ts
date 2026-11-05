import {
  directiveAttributeValue,
  type AttributeValue,
} from '@seminar/mdx/syntax';

import { readDirectiveSyntax, skipLabel } from './server/directiveSyntax.ts';

/** A change of a source, by offsets in it. */
export interface TextChange {
  start: number;
  end: number;
  text: string;
}

/** Values to set attributes to, or `null` to remove them. */
export type AttributeChanges = Readonly<Record<string, AttributeValue | null>>;

/** The name and the attributes of a directive, as its component gets them. */
export interface DirectiveAttributes {
  name: string;
  attributes: Record<string, AttributeValue>;
}

const NAME = /^[A-Za-z_:][\w.:-]*$/;

const UNQUOTED = /^[^\s"'<=>`{}]+$/;

/** Attributes that shorthands like `#id` and `.class` are also written as. */
const SHORTHANDS: ReadonlySet<string> = new Set(['id', 'class', 'className']);

/** Matches the indentation and the `>` of block quotes that start a line. */
const LINE_PREFIX = /^(?:[ \t]*>)*[ \t]*$/;

/** Matches the colons of a container directive that start a line. */
const CONTAINER_FENCE = /^(?:[ \t]*>)*[ \t]*(:{3,})/gm;

function checkName(directive: string, name: string): void {
  if (!NAME.test(name)) {
    throw new Error(`\`${name}\` can't be an attribute of \`${directive}\``);
  }
  if (SHORTHANDS.has(name)) {
    throw new Error(`The \`${name}\` of \`${directive}\` can't be edited`);
  }
}

/**
 * Returns the attribute `name` of the directive `directive` with `value` as
 * it's written in its source, so that its component gets `value` again, see
 * `directiveAttributeValue`: a bare word for `true`, and unquoted values
 * unless they would be read as another type.
 */
export function formatAttribute(
  directive: string,
  name: string,
  value: AttributeValue,
): string {
  checkName(directive, name);
  if (value === true) {
    return name;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `\`${name}\` of \`${directive}\` can't be ${String(value)}`,
    );
  }
  const text = String(value);
  const reads = (quoted: boolean) =>
    directiveAttributeValue(directive, name, text, quoted) === value;
  if (UNQUOTED.test(text) && reads(false)) {
    return `${name}=${text}`;
  }
  if (reads(true)) {
    if (!text.includes('"')) {
      return `${name}="${text}"`;
    }
    if (!text.includes("'")) {
      return `${name}='${text}'`;
    }
  }
  throw new Error(
    `\`${name}\` of \`${directive}\` can't be written as ${JSON.stringify(value)}`,
  );
}

/** Returns the attributes of `directive` with `changes`, after the existing ones. */
function formatAttributes(directive: string, changes: AttributeChanges) {
  return Object.entries(changes).flatMap(([name, value]) =>
    value === null ? [] : [formatAttribute(directive, name, value)],
  );
}

/** Returns the change from `before` to `after` at `start`, without what they share. */
function changeBetween(
  start: number,
  before: string,
  after: string,
): TextChange | undefined {
  if (before === after) {
    return undefined;
  }
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    start: start + prefix,
    end: start + before.length - suffix,
    text: after.slice(prefix, after.length - suffix),
  };
}

/** Reads the directive at `offset` of `source`, which starts with its colons. */
function readDirective(source: string, offset: number) {
  if (source[offset] !== ':') {
    return undefined;
  }
  const syntax = readDirectiveSyntax(source, offset);
  const name = source.slice(syntax.nameStart, syntax.nameEnd);
  const braces = skipLabel(source, syntax.nameEnd);
  return name === '' ||
    (source[braces] === '{' && syntax.attributesEnd === undefined)
    ? undefined
    : { ...syntax, name, braces };
}

/**
 * Returns the name and the attributes of the directive at `offset` of
 * `source`, where its colons are, as its component gets them, except for `id`
 * and `class`, or nothing if it can't be read.
 */
export function readAttributes(
  source: string,
  offset: number,
): DirectiveAttributes | undefined {
  const directive = readDirective(source, offset);
  if (directive === undefined) {
    return undefined;
  }
  const attributes: Record<string, AttributeValue> = {};
  for (const { name, value, quoted } of directive.attributes) {
    if (name !== '#' && name !== '.' && !SHORTHANDS.has(name)) {
      attributes[name] = directiveAttributeValue(
        directive.name,
        name,
        value,
        quoted,
      );
    }
  }
  return { name: directive.name, attributes };
}

/**
 * Returns the end of the name, label, and attributes of the directive at
 * `offset` of `source`, or nothing if it isn't a directive that can be read.
 */
export function directiveHeaderEnd(
  source: string,
  offset: number,
): number | undefined {
  const directive = readDirective(source, offset);
  return directive === undefined
    ? undefined
    : directive.attributesEnd === undefined
      ? directive.braces
      : directive.attributesEnd + 1;
}

/**
 * Returns the change that sets the attributes of the directive at `offset` of
 * `source` to `changes`, or nothing if they're already set so. It keeps how
 * the others are written, and adds new ones at the end. Several attributes of
 * the same name are set by the last one, so the others are removed.
 */
export function editAttributes(
  source: string,
  offset: number,
  changes: AttributeChanges,
): TextChange | undefined {
  const directive = readDirective(source, offset);
  if (directive === undefined) {
    throw new Error('There is no directive to edit here');
  }
  const { name, attributes, attributesEnd, braces } = directive;
  for (const attribute of Object.keys(changes)) {
    checkName(name, attribute);
  }
  const lastOf = new Map(
    attributes.map((attribute, index) => [attribute.name, index]),
  );
  // Whitespace before each attribute, and the attributes as written.
  const opening = braces + 1;
  const kept: { index: number; before: string; text: string }[] = [];
  attributes.forEach((attribute, index) => {
    const before = source.slice(
      index === 0 ? opening : (attributes[index - 1]?.valueEnd ?? opening),
      attribute.nameStart,
    );
    if (!Object.hasOwn(changes, attribute.name)) {
      kept.push({
        index,
        before,
        text: source.slice(attribute.nameStart, attribute.valueEnd),
      });
      return;
    }
    const value = changes[attribute.name];
    if (
      value !== null &&
      value !== undefined &&
      lastOf.get(attribute.name) === index
    ) {
      const text = formatAttribute(name, attribute.name, value);
      const valued = text.startsWith(`${attribute.name}=`);
      kept.push({
        index,
        before,
        // Keeps the spaces around `=` of values that are replaced.
        text:
          valued && attribute.valueStart > attribute.nameEnd
            ? source.slice(attribute.nameStart, attribute.valueStart) +
              text.slice(attribute.name.length + 1)
            : text,
      });
    }
  });
  const added = formatAttributes(
    name,
    Object.fromEntries(
      Object.entries(changes).filter(([attribute]) => !lastOf.has(attribute)),
    ),
  );
  const items = [
    ...kept,
    ...added.map((text) => ({ index: -1, before: ' ', text })),
  ];
  if (attributesEnd === undefined) {
    return items.length === 0
      ? undefined
      : {
          start: braces,
          end: braces,
          text: `{${items.map(({ text }) => text).join(' ')}}`,
        };
  }
  if (items.length === 0) {
    return attributes.length === 0 && attributesEnd === opening
      ? undefined
      : { start: braces, end: attributesEnd + 1, text: '' };
  }
  const leading =
    attributes.length === 0
      ? ''
      : source.slice(opening, attributes[0]?.nameStart ?? opening);
  const trailing = source.slice(
    attributes.at(-1)?.valueEnd ?? opening,
    attributesEnd,
  );
  const inside = items
    .map(({ index, before, text }, position) => {
      if (position === 0) {
        return `${leading}${text}`;
      }
      // Attributes may follow quotes without whitespace, but not other ones.
      const follows = items[position - 1]?.index === index - 1;
      return `${follows || before !== '' ? before : ' '}${text}`;
    })
    .join('');
  return changeBetween(
    opening,
    source.slice(opening, attributesEnd),
    `${inside}${trailing}`,
  );
}

/**
 * Returns the changes that write the container directive `name`, with the
 * attributes in `changes`, around the directives from `start` to `end` of
 * `source`, e.g., the `::::columns` that consecutive `:::column`s are wrapped
 * in without one. Its fences have more colons than the containers in it.
 */
export function wrapInDirective(
  source: string,
  start: number,
  end: number,
  name: string,
  changes: AttributeChanges,
): TextChange[] {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const prefix = source.slice(lineStart, start);
  if (!LINE_PREFIX.test(prefix) || source[start] !== ':') {
    throw new Error(`There are no directives to wrap in \`${name}\` here`);
  }
  let colons = 2;
  for (const [, fence = ''] of source
    .slice(lineStart, end)
    .matchAll(CONTAINER_FENCE)) {
    colons = Math.max(colons, fence.length);
  }
  const fence = ':'.repeat(colons + 1);
  const attributes = formatAttributes(name, changes);
  const braces = attributes.length === 0 ? '' : `{${attributes.join(' ')}}`;
  return [
    {
      start: lineStart,
      end: lineStart,
      text: `${prefix}${fence}${name}${braces}\n`,
    },
    { start: end, end, text: `\n${prefix}${fence}` },
  ];
}
