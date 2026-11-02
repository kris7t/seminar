/** A position in the source of a deck, from 1. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** Where a slide of a deck starts in its source, if known. */
export interface SlideSource {
  id?: string | undefined;
  start?: SourcePosition | undefined;
}

/** A change of the source of a deck, with lines and columns from 0. */
export interface SourceChange {
  startLine: number;
  startColumn: number;
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
 * Returns `position`, from 1, in the source with `change` applied: after the
 * change, it moves with what follows it, and inside of it, to its start.
 */
function shiftPosition(
  position: SourcePosition,
  { startLine, startColumn, endLine, endColumn, text }: SourceChange,
): SourcePosition {
  const line = position.line - 1;
  const column = position.column - 1;
  if (line < startLine || (line === startLine && column < startColumn)) {
    return position;
  }
  if (line < endLine || (line === endLine && column < endColumn)) {
    return { line: startLine + 1, column: startColumn + 1 };
  }
  const added = text.split('\n');
  const lastLine = added.at(-1) ?? '';
  const newEndLine = startLine + added.length - 1;
  const newEndColumn =
    added.length === 1 ? startColumn + lastLine.length : lastLine.length;
  return line === endLine
    ? {
        line: newEndLine + 1,
        column: newEndColumn + column - endColumn + 1,
      }
    : { line: line + newEndLine - endLine + 1, column: position.column };
}

/** Returns `position` in the source with `changes` applied, in order. */
export function shiftThrough(
  position: SourcePosition,
  changes: readonly SourceChange[],
): SourcePosition {
  return changes.reduce(shiftPosition, position);
}

/**
 * Returns `table` for the source with `changes` applied, so that it stays right
 * until saving the source compiles the deck again.
 */
export function shiftTable(
  table: readonly SlideSource[],
  changes: readonly SourceChange[],
): SlideSource[] {
  return table.map((slide) =>
    slide.start === undefined
      ? slide
      : { ...slide, start: shiftThrough(slide.start, changes) },
  );
}
