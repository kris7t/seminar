/**
 * Attributes given in a Pandoc-style attribute block, e.g.,
 * `{#id .class key=value key2="quoted value"}`.
 */
export interface AttributeBlock {
  id?: string | undefined;
  classes: string[];
  attributes: Map<string, string>;
}

/** Matches an attribute block at the end of a string. */
const TRAILING_BLOCK_PATTERN = /\s*\{([^{}]*)\}\s*$/;

/** Matches a single attribute in an attribute block. */
const ATTRIBUTE_PATTERN =
  /\s*(?:#([^\s"'=#.{}]+)|\.([^\s"'=#.{}]+)|([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'{}]+)))/y;

/**
 * Parses the contents of an attribute block (without the braces).
 *
 * @returns `undefined` if `contents` is not a valid attribute block.
 */
export function parseAttributeBlock(
  contents: string,
): AttributeBlock | undefined {
  const block: AttributeBlock = { classes: [], attributes: new Map() };
  ATTRIBUTE_PATTERN.lastIndex = 0;
  while (ATTRIBUTE_PATTERN.lastIndex < contents.trimEnd().length) {
    const match = ATTRIBUTE_PATTERN.exec(contents);
    if (match === null) {
      return undefined;
    }
    const [, id, className, key, doubleQuoted, singleQuoted, unquoted] = match;
    if (id !== undefined) {
      block.id = id;
    } else if (className !== undefined) {
      block.classes.push(className);
    } else if (key !== undefined) {
      block.attributes.set(key, doubleQuoted ?? singleQuoted ?? unquoted ?? '');
    }
  }
  return block;
}

/**
 * Splits an attribute block off the end of `text`.
 *
 * @returns The text before the attribute block and the parsed block, or
 *   `undefined` if `text` doesn't end with a valid attribute block.
 */
export function splitTrailingAttributeBlock(
  text: string,
): [text: string, block: AttributeBlock] | undefined {
  const match = TRAILING_BLOCK_PATTERN.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const block = parseAttributeBlock(match[1]);
  return block === undefined ? undefined : [text.slice(0, match.index), block];
}
