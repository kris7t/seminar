import type { AttributeValue } from '@seminar/mdx/syntax';

import {
  directiveHeaderEnd,
  editAttributes,
  readAttributes,
  wrapInDirective,
  type AttributeChanges,
  type TextChange,
} from './attributeEdits.ts';
import {
  shiftThrough,
  type SourceChange,
  type SourcePosition,
} from './slideTable.ts';

/** Where a directive is in the saved source of a deck, as a page tells it. */
export interface SavedRange {
  start: SourcePosition;
  end: SourcePosition;
}

/**
 * An edit of the attributes of a directive that a page asks for, by where it
 * is in the saved source, or of the container that the directives in the
 * range are wrapped in without one, like `columns`.
 */
export interface AttributeEdit {
  range: SavedRange;
  /** The path of the file, if it isn't the deck. */
  file?: string | undefined;
  wrapper?: string | undefined;
  changes: AttributeChanges;
}

/** The attributes of a directive edited since the source was saved. */
export interface PendingAttributes {
  range: SavedRange;
  wrapper?: string | undefined;
  /**
   * The attributes in the saved source, so that pages can tell whether they
   * compiled it before or after the edits.
   */
  saved: Record<string, AttributeValue>;
  attributes: Record<string, AttributeValue>;
}

/** A directive edited since the source was saved. */
interface Tracked {
  range: SavedRange;
  wrapper: string | undefined;
  name: string;
  saved: Record<string, AttributeValue>;
}

/** What is known of a source since it was saved. */
interface SourceState {
  saved: string;
  /** The changes of the source since it was saved, in order. */
  changes: SourceChange[];
  tracked: Tracked[];
}

/** Returns the offset of `position`, from 1, in `source`. */
function offsetAt(source: string, { line, column }: SourcePosition): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = source.indexOf('\n', offset);
    if (next < 0) {
      return source.length;
    }
    offset = next + 1;
  }
  return Math.min(offset + column - 1, source.length);
}

const LINE_PREFIX = /(?:[ \t]*>)*[ \t]*/y;

const CHANGED =
  'The source of what was edited in the preview has changed, save it to edit it again';

function sameRange(a: SavedRange, b: SavedRange): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.column === b.start.column &&
    a.end.line === b.end.line &&
    a.end.column === b.end.column
  );
}

function isAttributeValue(value: unknown): value is AttributeValue | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isPosition(value: unknown): value is SourcePosition {
  const { line, column } = (value ?? {}) as Partial<SourcePosition>;
  return (
    Number.isInteger(line) &&
    Number.isInteger(column) &&
    (line ?? 0) >= 1 &&
    (column ?? 0) >= 1
  );
}

/** Returns the edits that a page asks for in `data`, if they're valid. */
export function parseAttributeEdits(
  data: unknown,
): AttributeEdit[] | undefined {
  if (!Array.isArray(data)) {
    return undefined;
  }
  const edits: AttributeEdit[] = [];
  for (const edit of data as unknown[]) {
    const { range, wrapper, changes } = (edit ?? {}) as {
      range?: { start?: unknown; end?: unknown; file?: unknown };
      wrapper?: unknown;
      changes?: unknown;
    };
    const { start, end, file } = range ?? {};
    if (
      !isPosition(start) ||
      !isPosition(end) ||
      (file !== undefined && typeof file !== 'string') ||
      (wrapper !== undefined && typeof wrapper !== 'string') ||
      typeof changes !== 'object' ||
      changes === null ||
      Array.isArray(changes) ||
      !Object.values(changes).every(isAttributeValue)
    ) {
      return undefined;
    }
    edits.push({
      range: { start, end },
      file,
      wrapper,
      changes: changes as AttributeChanges,
    });
  }
  return edits;
}

/**
 * Keeps track of the attributes of directives that pages edit in the sources
 * of decks, which they only compile again once they're saved, so that they
 * can show the edits until then. Pages tell where directives are in the saved
 * sources, which the changes since then take to the edited ones.
 */
export class SourceEdits {
  readonly #sources = new Map<string, SourceState>();

  /**
   * Tells that `file` is saved as `text`, e.g., when it's opened, saved, or
   * changed back to what is saved. Returns whether it had edits, which are
   * now forgotten.
   */
  saved(file: string, text: string): boolean {
    const tracked = this.#sources.get(file)?.tracked.length ?? 0;
    this.#sources.set(file, { saved: text, changes: [], tracked: [] });
    return tracked > 0;
  }

  /**
   * Forgets `file`, e.g., when it's closed, and returns whether it had edits.
   */
  closed(file: string): boolean {
    const tracked = this.#sources.get(file)?.tracked.length ?? 0;
    this.#sources.delete(file);
    return tracked > 0;
  }

  /**
   * Tells the `changes` of `file` since it was last told about, which made it
   * `text`, and returns whether it has edits, whose attributes may have
   * changed. Forgets the edits if it's what is saved again, e.g., undone.
   */
  changed(
    file: string,
    changes: readonly SourceChange[],
    text: string,
  ): boolean {
    const state = this.#sources.get(file);
    if (state === undefined) {
      return false;
    }
    if (text === state.saved) {
      return this.saved(file, text);
    }
    state.changes.push(...changes);
    return state.tracked.length > 0;
  }

  /** The files with edits. */
  get files(): string[] {
    return [...this.#sources]
      .filter(([, { tracked }]) => tracked.length > 0)
      .map(([file]) => file);
  }

  /**
   * Returns the changes of `text`, the source of `file` now, that make
   * `edits`, and keeps track of the edited directives. Throws if a directive
   * has changed since `file` was saved, other than by these edits, or if the
   * attributes can't be written so.
   */
  edit(
    file: string,
    text: string,
    edits: readonly AttributeEdit[],
  ): TextChange[] {
    const state = this.#sources.get(file);
    if (state === undefined) {
      throw new Error(
        `Save ${file} before editing it in a preview, since it was changed before`,
      );
    }
    const textChanges: TextChange[] = [];
    const tracked: Tracked[] = [];
    for (const edit of edits) {
      const known = state.tracked.find(
        ({ range, wrapper }) =>
          wrapper === edit.wrapper && sameRange(range, edit.range),
      );
      if (known !== undefined) {
        const offset = this.#locate(state, text, known);
        if (offset === undefined) {
          throw new Error(CHANGED);
        }
        const change = editAttributes(text, offset, edit.changes);
        textChanges.push(...(change === undefined ? [] : [change]));
      } else if (edit.wrapper !== undefined) {
        const [start, end] = this.#unchanged(state, text, edit.range, false);
        const wrapping = Object.values(edit.changes).some(
          (value) => value !== null,
        );
        if (wrapping) {
          textChanges.push(
            ...wrapInDirective(text, start, end, edit.wrapper, edit.changes),
          );
          tracked.push({
            range: edit.range,
            wrapper: edit.wrapper,
            name: edit.wrapper,
            saved: {},
          });
        }
      } else {
        const [start] = this.#unchanged(state, text, edit.range, true);
        const change = editAttributes(text, start, edit.changes);
        textChanges.push(...(change === undefined ? [] : [change]));
        const read = readAttributes(text, start);
        tracked.push({
          range: edit.range,
          wrapper: undefined,
          name: read?.name ?? '',
          saved: read?.attributes ?? {},
        });
      }
    }
    textChanges.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < textChanges.length; index += 1) {
      if (
        (textChanges[index]?.start ?? 0) < (textChanges[index - 1]?.end ?? 0)
      ) {
        throw new Error('The edits of the preview overlap');
      }
    }
    state.tracked.push(...tracked);
    return textChanges;
  }

  /**
   * Returns the attributes of the directives of `file` edited since it was
   * saved, by where they are in the saved source, read from `text`, its source
   * now, without those that can't be read now.
   */
  pending(file: string, text: string): PendingAttributes[] {
    const state = this.#sources.get(file);
    return (state?.tracked ?? []).flatMap((tracked) => {
      const { range, wrapper, saved } = tracked;
      const offset = state && this.#locate(state, text, tracked);
      const read =
        offset === undefined ? undefined : readAttributes(text, offset);
      return read === undefined
        ? []
        : [
            {
              range,
              ...(wrapper === undefined ? {} : { wrapper }),
              saved,
              attributes: read.attributes,
            },
          ];
    });
  }

  /**
   * Returns the offsets in `text` of what is at `range` of the saved source,
   * and throws if it has changed since, only its first line if `header`.
   */
  #unchanged(
    { saved, changes }: SourceState,
    text: string,
    range: SavedRange,
    header: boolean,
  ): [number, number] {
    const savedStart = offsetAt(saved, range.start);
    const savedEnd = header
      ? directiveHeaderEnd(saved, savedStart)
      : offsetAt(saved, range.end);
    const start = offsetAt(text, shiftThrough(range.start, changes));
    if (
      savedEnd === undefined ||
      text.slice(start, start + savedEnd - savedStart) !==
        saved.slice(savedStart, savedEnd)
    ) {
      throw new Error(CHANGED);
    }
    return [start, start + savedEnd - savedStart];
  }

  /**
   * Returns the offset in `text` of the colons of a directive edited since the
   * source was saved, if it's still there. A wrapper that was written starts
   * the line of the first directive in it, before what is added there.
   */
  #locate(
    { changes }: SourceState,
    text: string,
    { range, wrapper, name }: Tracked,
  ): number | undefined {
    let offset: number;
    if (wrapper === undefined) {
      offset = offsetAt(text, shiftThrough(range.start, changes));
    } else {
      const lineStart = offsetAt(
        text,
        shiftThrough({ line: range.start.line, column: 1 }, changes, true),
      );
      LINE_PREFIX.lastIndex = lineStart;
      offset = lineStart + (LINE_PREFIX.exec(text)?.[0].length ?? 0);
    }
    return readAttributes(text, offset)?.name === name ? offset : undefined;
  }
}
