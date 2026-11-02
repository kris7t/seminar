/** Where a slide of a deck starts in its source, if known, from 1. */
export interface SlideSource {
  id?: string | undefined;
  start?: { line: number; column: number } | undefined;
}

/** A change of the source of a deck, with lines and columns from 0. */
export interface SourceChange {
  startLine: number;
  endLine: number;
  endColumn: number;
  /** The text that replaces the range. */
  text: string;
}

/**
 * Returns the index of the slide with the source at `line`, from 0: the last
 * one starting there or above. Several slides start at the same place if an
 * `::include` shows them, so `current` is kept if it's one of those.
 */
export function slideAtLine(
  table: readonly SlideSource[],
  line: number,
  current?: number,
): number | undefined {
  let bestLine = -1;
  for (const { start } of table) {
    if (start !== undefined && start.line - 1 <= line) {
      bestLine = Math.max(bestLine, start.line - 1);
    }
  }
  if (bestLine < 0) {
    return undefined;
  }
  const startsThere = (index: number) => {
    const start = table[index]?.start;
    return start !== undefined && start.line - 1 === bestLine;
  };
  return current !== undefined && startsThere(current)
    ? current
    : table.findIndex((_, index) => startsThere(index));
}

/**
 * Returns `table` for the source with `changes` applied, in order, so that it
 * stays right until saving the source compiles the deck again.
 */
export function shiftTable(
  table: readonly SlideSource[],
  changes: readonly SourceChange[],
): SlideSource[] {
  return table.map((slide) => {
    if (slide.start === undefined) {
      return slide;
    }
    let line = slide.start.line - 1;
    let { column } = slide.start;
    for (const { startLine, endLine, endColumn, text } of changes) {
      const delta = text.split('\n').length - 1 - (endLine - startLine);
      if (line > endLine || (line === endLine && column - 1 >= endColumn)) {
        line += delta;
      } else if (line > startLine) {
        // The start of the slide was replaced.
        line = startLine;
        column = 1;
      }
    }
    return { ...slide, start: { line: line + 1, column } };
  });
}
