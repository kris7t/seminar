/** Matches the colons and the name of a directive. */
const DIRECTIVE_NAME = /(:*)([^\s[{:]*)/y;

/** Returns the offset after the label of a directive at `offset`, if any. */
export function skipLabel(source: string, offset: number): number {
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

/** An attribute of a directive, with offsets in the deck. */
export interface DirectiveAttribute {
  /** `#` for `#id`, `.` for `.class`, or the name of the attribute. */
  name: string;
  nameStart: number;
  nameEnd: number;
  /** The value, without quotes, or `undefined` for a bare word. */
  value: string | undefined;
  /** Offsets of the value, with its quotes. */
  valueStart: number;
  valueEnd: number;
  quoted: boolean;
}

/** The syntax of a directive in its source. */
export interface DirectiveSyntax {
  /** Offsets of the name of the directive, after its colons. */
  nameStart: number;
  nameEnd: number;
  attributes: DirectiveAttribute[];
  /** Offset of the `}` that closes the attributes, if there are any. */
  attributesEnd: number | undefined;
}

const SPACE = /\s*/y;
const SHORTHAND = /([#.])([^\s"'<=>`{}#.]+)/y;
const NAME = /[A-Za-z_:][\w.:-]*/y;
const EQUALS = /\s*=\s*/y;
const VALUE = /"([^"]*)"|'([^']*)'|([^\s"'<=>`{}]+)/y;

function matchAt(pattern: RegExp, source: string, offset: number) {
  pattern.lastIndex = offset;
  return pattern.exec(source);
}

/**
 * Reads the name and the attributes of the directive at `offset` in `source`,
 * like `remark-directive` does, e.g., `::callout[Text]{for=arch .wide step}`.
 * Stops at the first attribute that isn't valid.
 */
export function readDirectiveSyntax(
  source: string,
  offset: number,
): DirectiveSyntax {
  const name = matchAt(DIRECTIVE_NAME, source, offset);
  const nameStart = offset + (name?.[1]?.length ?? 0);
  const nameEnd = nameStart + (name?.[2]?.length ?? 0);
  const attributes: DirectiveAttribute[] = [];
  let position = skipLabel(source, nameEnd);
  if (source[position] !== '{') {
    return { nameStart, nameEnd, attributes, attributesEnd: undefined };
  }
  position += 1;
  for (;;) {
    position += matchAt(SPACE, source, position)?.[0].length ?? 0;
    if (source[position] === '}') {
      return { nameStart, nameEnd, attributes, attributesEnd: position };
    }
    const shorthand = matchAt(SHORTHAND, source, position);
    if (shorthand !== null) {
      const [whole, kind = '', value = ''] = shorthand;
      attributes.push({
        name: kind,
        nameStart: position,
        nameEnd: position + 1,
        value,
        valueStart: position + 1,
        valueEnd: position + whole.length,
        quoted: false,
      });
      position += whole.length;
      continue;
    }
    const attributeName = matchAt(NAME, source, position)?.[0];
    if (attributeName === undefined) {
      return { nameStart, nameEnd, attributes, attributesEnd: undefined };
    }
    const nameEndOffset = position + attributeName.length;
    const equals = matchAt(EQUALS, source, nameEndOffset)?.[0] ?? '';
    const value =
      equals === ''
        ? null
        : matchAt(VALUE, source, nameEndOffset + equals.length);
    if (equals !== '' && value === null) {
      return { nameStart, nameEnd, attributes, attributesEnd: undefined };
    }
    const valueStart = nameEndOffset + equals.length;
    const valueEnd = valueStart + (value?.[0].length ?? 0);
    attributes.push({
      name: attributeName,
      nameStart: position,
      nameEnd: nameEndOffset,
      value: value === null ? undefined : (value[1] ?? value[2] ?? value[3]),
      valueStart: value === null ? nameEndOffset : valueStart,
      valueEnd: value === null ? nameEndOffset : valueEnd,
      quoted: value !== null && value[3] === undefined,
    });
    position = value === null ? nameEndOffset : valueEnd;
  }
}
