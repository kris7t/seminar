import type { Attributes } from './directives.ts';

/**
 * A word of a line of attributes: an attribute, i.e., `#id`, `.class`,
 * `key=value` or `key="quoted value"`, or a bare word, or something else,
 * like `{1-3|5}`, kept as a whole.
 */
const WORD =
  /\{[^}]*\}|[^\s"'=]+=(?:"[^"]*"|'[^']*'|[^\s"']*)|"[^"]*"|'[^']*'|\S+/g;

const ATTRIBUTE =
  /^(?:[#.][^\s"'=#.{}]+|[A-Za-z_][\w-]*(?:=(?:"[^"]*"|'[^']*'|[^\s"'{}]+))?)$/;

function unquote(value: string): string {
  return /^(?:"[^"]*"|'[^']*')$/.test(value) ? value.slice(1, -1) : value;
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
  const attributes: Attributes = { classes: [], attributes: new Map() };
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
      attributes.attributes.set(
        separator === -1 ? word : word.slice(0, separator),
        separator === -1 ? '' : unquote(word.slice(separator + 1)),
      );
    }
  }
  return { attributes, rest: rest.length === 0 ? undefined : rest.join(' ') };
}
