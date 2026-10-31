import type { Point, Position } from 'unist';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import type { PluggableList, Processor } from 'unified';

import {
  rewriteHeadingAttributes,
  sourceOffsets,
} from './directives/remarkHeadingAttributes.ts';

export { findPackage } from './config/packages.ts';

/** A location of the parser of JavaScript, with a column from 0. */
interface AcornLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/** Moves the positions that the parser reports back to the source of a deck. */
function createPositionRestorer(source: string, rewritten: string) {
  const toSource = sourceOffsets(source, rewritten);
  const lineStarts = [0];
  for (const { index } of source.matchAll(/\n/g)) {
    lineStarts.push(index + 1);
  }
  const columnOf = (line: number, offset: number) =>
    offset - (lineStarts[line - 1] ?? 0);

  const restorePoint = (point: Point) => {
    if (point.offset !== undefined) {
      point.offset = toSource(point.offset);
      point.column = columnOf(point.line, point.offset) + 1;
    }
  };

  const seen = new WeakSet();
  const restore = (value: unknown) => {
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(restore);
      return;
    }
    const node = value as {
      position?: Position;
      start?: unknown;
      end?: unknown;
      range?: [number, number];
      loc?: AcornLocation;
    };
    if (node.position !== undefined) {
      restorePoint(node.position.start);
      restorePoint(node.position.end);
    }
    if (typeof node.start === 'number' && typeof node.end === 'number') {
      const start = toSource(node.start);
      const end = toSource(node.end);
      node.start = start;
      node.end = end;
      if (node.range !== undefined) {
        node.range = [start, end];
      }
      if (node.loc !== undefined) {
        node.loc.start.column = columnOf(node.loc.start.line, start);
        node.loc.end.column = columnOf(node.loc.end.line, end);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'position' && key !== 'loc' && key !== 'range') {
        restore(child);
      }
    }
  };

  const restorePlace = (place: Point | Position) => {
    if ('start' in place) {
      restorePoint(place.start);
      restorePoint(place.end);
    } else {
      restorePoint(place);
    }
  };

  return { restore, restorePlace };
}

/**
 * Parses attribute blocks of headings and images like
 * `remarkHeadingAttributes`, but keeps the positions in the syntax tree and
 * in parse errors true to the source, which the compiler doesn't need. Tools
 * that use the positions to look up the source need them, like the language
 * server of the editor extension.
 */
export function remarkSourceHeadingAttributes(this: Processor): undefined {
  const { parser } = this;
  if (parser === undefined) {
    return;
  }
  this.parser = (document, file) => {
    const rewritten = rewriteHeadingAttributes(document);
    const { restore, restorePlace } = createPositionRestorer(
      document,
      rewritten,
    );
    try {
      const tree = parser(rewritten, file);
      restore(tree);
      return tree;
    } catch (error) {
      const place = (error as { place?: Point | Position | undefined }).place;
      if (place !== undefined) {
        restorePlace(place);
      }
      throw error;
    }
  };
}

/**
 * The syntax plugins that parse decks with positions in their source, to use
 * after `remark-parse` and `remark-mdx`.
 *
 * @param syntaxPlugins The syntax plugins of the configs of the deck, like
 *   `remarkMath`.
 */
export function deckSyntaxPlugins(
  syntaxPlugins: PluggableList = [],
): PluggableList {
  return [
    remarkSourceHeadingAttributes,
    remarkFrontmatter,
    ...syntaxPlugins,
    remarkDirective,
  ];
}
