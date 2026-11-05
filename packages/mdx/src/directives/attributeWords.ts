import type { Attributes } from './directives.ts';

/**
 * A word of a line of attributes: an attribute, i.e., `#id`, `.class`,
 * `key=value` or `key="quoted value"`, or a bare word, or something else,
 * like `{1-3|5}`, kept as a whole.
 */
const WORD =
  /\{[^{}]*\}|[^\s"'=]+=(?:"[^"]*"|'[^']*'|[^\s"']*)|"[^"]*"|'[^']*'|\S+/g;

const ATTRIBUTE =
  /^(?:[#.][^\s"'=#.{}]+|[A-Za-z_][\w-]*(?:=(?:"[^"]*"|'[^']*'|[^\s"'{}]+))?)$/;

function unquote(value: string): string {
  return /^(?:"[^"]*"|'[^']*')$/.test(value) ? value.slice(1, -1) : value;
}

/**
 * Returns the bare words among the attributes in a line of words, which
 * {@link parseAttributeWords} reads as attributes without values, with their
 * offsets in `text`.
 */
export function bareAttributeWords(
  text: string,
): { word: string; index: number }[] {
  return [...text.matchAll(WORD)]
    .filter(([word]) => ATTRIBUTE.test(word) && /^[^#.][^=]*$/.test(word))
    .map(({ 0: word, index }) => ({ word, index }));
}

/** An attribute in a line of words, with its offsets in the line. */
export interface AttributeWord {
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

/**
 * Returns the attributes in a line of words, like {@link parseAttributeWords}
 * reads them, with their offsets in `text`.
 */
export function readAttributeWords(text: string): AttributeWord[] {
  return [...text.matchAll(WORD)].flatMap(
    ({ 0: word, index }): AttributeWord[] => {
      if (!ATTRIBUTE.test(word)) {
        return [];
      }
      if (word.startsWith('#') || word.startsWith('.')) {
        return [
          {
            name: word.charAt(0),
            nameStart: index,
            nameEnd: index + 1,
            value: word.slice(1),
            valueStart: index + 1,
            valueEnd: index + word.length,
            quoted: false,
          },
        ];
      }
      const separator = word.indexOf('=');
      const end = index + word.length;
      if (separator === -1) {
        return [
          {
            name: word,
            nameStart: index,
            nameEnd: end,
            value: undefined,
            valueStart: end,
            valueEnd: end,
            quoted: false,
          },
        ];
      }
      const raw = word.slice(separator + 1);
      const value = unquote(raw);
      return [
        {
          name: word.slice(0, separator),
          nameStart: index,
          nameEnd: index + separator,
          value,
          valueStart: index + separator + 1,
          valueEnd: end,
          quoted: value !== raw,
        },
      ];
    },
  );
}

/**
 * Reads the attributes in a line of words, e.g., the rest of the first line
 * of a code block after its language, like `#fib .wide step group=impl`,
 * written like the attributes of directives, but without braces.
 *
 * @returns The attributes, and the other words, e.g., `{1-3|5}`, joined
 *   with spaces, or `undefined` if there are none.
 */
export function parseAttributeWords(text: string | undefined): {
  attributes: Attributes;
  rest: string | undefined;
} {
  const quoted = new Set<string>();
  const attributes: Attributes = {
    classes: [],
    attributes: new Map(),
    quoted,
  };
  const rest: string[] = [];
  for (const [word] of (text ?? '').matchAll(WORD)) {
    if (!ATTRIBUTE.test(word)) {
      rest.push(word);
    } else if (word.startsWith('#')) {
      attributes.id = word.slice(1);
    } else if (word.startsWith('.')) {
      attributes.classes.push(word.slice(1));
    } else {
      const separator = word.indexOf('=');
      const name = separator === -1 ? word : word.slice(0, separator);
      const value = separator === -1 ? '' : word.slice(separator + 1);
      const unquoted = unquote(value);
      attributes.attributes.set(name, unquoted);
      if (unquoted !== value) {
        quoted.add(name);
      }
    }
  }
  return { attributes, rest: rest.length === 0 ? undefined : rest.join(' ') };
}
