import postcss from 'postcss';

/** An inclusive range of code points. */
export type CodePointRange = readonly [start: number, end: number];

/**
 * Parses a CSS `unicode-range`, e.g., `U+0000-00FF, U+0131, U+4??`.
 *
 * @returns `undefined` if `value` is not a valid `unicode-range`.
 */
export function parseUnicodeRange(value: string): CodePointRange[] | undefined {
  const ranges: CodePointRange[] = [];
  for (const part of value.split(',')) {
    const match = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(
      part,
    );
    const [, start, end] = match ?? [];
    if (start === undefined) {
      return undefined;
    }
    if (end !== undefined) {
      ranges.push([Number.parseInt(start, 16), Number.parseInt(end, 16)]);
    } else {
      // Wildcards, e.g., `U+4??` for `U+400-4FF`.
      ranges.push([
        Number.parseInt(start.replaceAll('?', '0'), 16),
        Number.parseInt(start.replaceAll('?', 'f'), 16),
      ]);
    }
  }
  return ranges;
}

const CHARACTER_REFERENCE_PATTERN = /&#x([0-9a-f]+);|&#(\d+);/gi;

/**
 * Collects the code points used in `texts`.
 *
 * Control characters are left out, since they don't need glyphs. JavaScript
 * escapes, like `\u0400`, are ignored, since they mostly occur in
 * regular expressions of libraries, which would keep fonts for scripts that
 * the page never shows. The minifier writes the other non-ASCII characters of
 * strings literally.
 *
 * HTML character references, like `&#x416;`, are only counted if `html` is
 * set, i.e., in the HTML page. In scripts, they are only used for MathML,
 * which is read by assistive technology and needs no fonts.
 */
export function collectCodePoints(
  texts: Iterable<string>,
  { html = false }: { html?: boolean } = {},
): Set<number> {
  const codePoints = new Set<number>();
  for (const text of texts) {
    for (const character of text) {
      codePoints.add(character.codePointAt(0) ?? 0);
    }
    if (!html) {
      continue;
    }
    for (const [, hex, decimal] of text.matchAll(CHARACTER_REFERENCE_PATTERN)) {
      codePoints.add(
        hex === undefined
          ? Number.parseInt(decimal ?? '', 10)
          : Number.parseInt(hex, 16),
      );
    }
  }
  // Control characters, like line breaks, don't need glyphs.
  for (const codePoint of codePoints) {
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
      codePoints.delete(codePoint);
    }
  }
  return codePoints;
}

/** Splits a CSS value at top-level commas, e.g., the sources of a font. */
function splitList(value: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const character = value[i];
    if (quote !== undefined) {
      if (character === '\\') {
        i += 1;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      items.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items;
}

function getFormat(source: string): string | undefined {
  return /format\(\s*["']?([\w-]+)["']?\s*\)\s*$/i
    .exec(source)?.[1]
    ?.toLowerCase();
}

export interface PruneFontsOptions {
  /** Code points used by the page. */
  used: ReadonlySet<number>;
  /** Ranges of code points to keep even if they are not used. */
  keep?: readonly CodePointRange[] | undefined;
}

/**
 * Removes fonts that a self-contained page doesn't need from `css`:
 *
 * - WOFF sources of fonts that also have a WOFF2 source, since every browser
 *   that runs the page supports WOFF2.
 * - Fonts whose `unicode-range` contains no used code point, e.g., the
 *   Cyrillic subsets of a font in a deck written in English.
 */
export function pruneFonts(
  css: string,
  { used, keep = [] }: PruneFontsOptions,
): string {
  const isNeeded = ([start, end]: CodePointRange) => {
    if (keep.some(([from, to]) => from <= end && start <= to)) {
      return true;
    }
    for (const codePoint of used) {
      if (start <= codePoint && codePoint <= end) {
        return true;
      }
    }
    return false;
  };
  const root = postcss.parse(css);
  root.walkAtRules(/^font-face$/i, (rule) => {
    let ranges: CodePointRange[] | undefined;
    rule.walkDecls(/^unicode-range$/i, (declaration) => {
      ranges = parseUnicodeRange(declaration.value);
    });
    if (ranges !== undefined && !ranges.some(isNeeded)) {
      rule.remove();
      return;
    }
    rule.walkDecls(/^src$/i, (declaration) => {
      const sources = splitList(declaration.value);
      if (sources.some((source) => getFormat(source) === 'woff2')) {
        declaration.value = sources
          .filter((source) => getFormat(source) !== 'woff')
          .join(', ');
      }
    });
  });
  return root.toString();
}
