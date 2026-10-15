import type { Processor } from 'unified';

/** A single attribute: `#id`, `.class`, `key=value`, or a bare `word`. */
const ATTRIBUTE =
  /(?:[#.][^\s"'=#.{}]+|[A-Za-z_][\w-]*(?:=(?:"[^"]*"|'[^']*'|[^\s"'{}]+))?)/
    .source;

/** Matches an ATX heading that ends with an attribute block. */
const HEADING_PATTERN = new RegExp(
  `^( {0,3}#{1,6}(?:[ \\t].*?)?[ \\t])(\\{[ \\t]*${ATTRIBUTE}(?:[ \\t]+${ATTRIBUTE})*[ \\t]*\\})([ \\t]*#*[ \\t]*)$`,
);

/** Matches the opening or closing line of a fenced code block. */
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Rewrites attribute blocks at the end of headings, e.g., `## Title {#id}`,
 * to `:slide` directives, e.g., `## Title :slide{#id}`, outside of fenced
 * code and the frontmatter. Blocks with anything but ids, classes, `key=value`
 * attributes, and bare words are left alone, since they are MDX expressions,
 * e.g., `## Total {String(count)}`. Thus, a block with a single variable,
 * e.g., `## Total {count}`, is an attribute block, where `count` is the
 * master of the slide.
 */
export function rewriteHeadingAttributes(source: string): string {
  const lines = source.split(/(?<=\n)/);
  let fence: string | undefined;
  let frontmatter = lines[0]?.trimEnd() === '---';
  return lines
    .map((line, index) => {
      if (frontmatter) {
        if (index > 0 && line.trimEnd() === '---') {
          frontmatter = false;
        }
        return line;
      }
      const fenceMatch = FENCE_PATTERN.exec(line);
      if (fenceMatch?.[1] !== undefined) {
        const marker = fenceMatch[1];
        if (fence === undefined) {
          fence = marker;
        } else if (
          marker.startsWith(fence.charAt(0)) &&
          marker.length >= fence.length
        ) {
          fence = undefined;
        }
        return line;
      }
      if (fence !== undefined) {
        return line;
      }
      const ending = /\r?\n$/.exec(line)?.[0] ?? '';
      const content = line.slice(0, line.length - ending.length);
      const match = HEADING_PATTERN.exec(content);
      return match === null
        ? line
        : `${match[1] ?? ''}:slide${match[2] ?? ''}${match[3] ?? ''}${ending}`;
    })
    .join('');
}

/**
 * Lets headings end with an attribute block without the `:slide` directive,
 * e.g., `## Title {#id .section}`, by rewriting the source before it's parsed
 * (see {@link rewriteHeadingAttributes}). MDX would parse the block as an
 * expression otherwise.
 *
 * Must be used after the parser, e.g., after `remark-parse`, which MDX adds
 * before the remark plugins. Rewritten headings get longer, so the columns of
 * positions after the block on those lines are off.
 */
export function remarkHeadingAttributes(this: Processor): undefined {
  const { parser } = this;
  if (parser === undefined) {
    return;
  }
  this.parser = (document, file) => {
    const rewritten = rewriteHeadingAttributes(document);
    // Positions refer to the rewritten source.
    (file.data as { sliderSource?: string }).sliderSource = rewritten;
    return parser(rewritten, file);
  };
}
