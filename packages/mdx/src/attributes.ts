/**
 * Attributes given in a Pandoc-style attribute block, e.g.,
 * `{#id .class key=value key2="quoted value" flag}`.
 */
export interface AttributeBlock {
  id?: string | undefined;
  classes: string[];
  attributes: Map<string, string>;
  /**
   * Bare words without a value, which Pandoc doesn't support. Only the flags
   * passed to the parser are accepted, so that other text in braces isn't
   * mistaken for an attribute block.
   */
  flags: string[];
}

/** Matches an attribute block at the end of a string. */
const TRAILING_BLOCK_PATTERN = /\s*\{([^{}]*)\}\s*$/;

/** Matches an attribute block at the start of a string. */
const LEADING_BLOCK_PATTERN = /^\s*\{([^{}]*)\}\s*/;

/** Matches a single attribute in an attribute block. */
const ATTRIBUTE_PATTERN =
  /\s*(?:#([^\s"'=#.{}]+)|\.([^\s"'=#.{}]+)|([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'{}]+)))?(?=[\s}]|$))/y;

const NO_FLAGS: ReadonlySet<string> = new Set();

/**
 * Parses the contents of an attribute block (without the braces).
 *
 * @param flags The bare words accepted in the block.
 * @returns `undefined` if `contents` is not a valid attribute block.
 */
export function parseAttributeBlock(
  contents: string,
  flags: ReadonlySet<string> = NO_FLAGS,
): AttributeBlock | undefined {
  const block: AttributeBlock = {
    classes: [],
    attributes: new Map(),
    flags: [],
  };
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
      const value = doubleQuoted ?? singleQuoted ?? unquoted;
      if (value === undefined) {
        if (!flags.has(key)) {
          return undefined;
        }
        block.flags.push(key);
      } else {
        block.attributes.set(key, value);
      }
    }
  }
  return block;
}

/**
 * Splits an attribute block off the end of `text`.
 *
 * @param flags The bare words accepted in the block.
 * @returns The text before the attribute block and the parsed block, or
 *   `undefined` if `text` doesn't end with a valid attribute block.
 */
export function splitTrailingAttributeBlock(
  text: string,
  flags?: ReadonlySet<string>,
): [text: string, block: AttributeBlock] | undefined {
  const match = TRAILING_BLOCK_PATTERN.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const block = parseAttributeBlock(match[1], flags);
  return block === undefined ? undefined : [text.slice(0, match.index), block];
}

/**
 * Splits an attribute block off the start of `text`.
 *
 * @param flags The bare words accepted in the block.
 * @returns The parsed block and the text after it, or `undefined` if `text`
 *   doesn't start with a valid attribute block.
 */
export function splitLeadingAttributeBlock(
  text: string,
  flags?: ReadonlySet<string>,
): [block: AttributeBlock, text: string] | undefined {
  const match = LEADING_BLOCK_PATTERN.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const block = parseAttributeBlock(match[1], flags);
  return block === undefined ? undefined : [block, text.slice(match[0].length)];
}
