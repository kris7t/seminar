import { parse, type DiagramModel } from 'pele';

/** A line of the source of a diagram. */
export interface Line {
  /** Index of the line in the source, from 0. */
  index: number;
  text: string;
}

/**
 * The items of a diagram, e.g., its nodes, clusters, and edges, by their ids,
 * which are the `data-id` of their elements, and how they are related.
 */
export interface Items {
  /** Labels of the items, e.g., for the titles of steps. */
  labels: Map<string, string>;
  /** The item that an item is in, e.g., its cluster, if any. */
  parents: Map<string, string>;
  /** The ends of the edges, which are shown with the later of them. */
  ends: Map<string, [start: string, end: string]>;
  /** Ids that several items have, e.g., nodes of mind maps without ids. */
  duplicates?: ReadonlySet<string> | undefined;
}

/** What the steps of the items of a type of diagrams need to know. */
export interface Adapter {
  items: Items;
  /**
   * Returns what the statement on `line` is about, or `undefined` if it can't
   * be told, e.g., if it can't be parsed alone.
   */
  about: (line: Line) => string[] | undefined;
  /**
   * Returns the item of the shape data after `before` on `line`, e.g., `B`
   * for `B[Parser]@{ … }`, if the type of diagrams has shape data.
   */
  shapeDataItem?:
    | ((line: Line, before: string, after: string) => string | undefined)
    | undefined;
}

/** Returns the lines of `source` after its frontmatter, e.g., of `config`. */
export function linesOf(source: string): Line[] {
  const lines = source.split('\n').map((text, index) => ({ index, text }));
  if (lines[0]?.text.trim() !== '---') {
    return lines;
  }
  const end = lines.findIndex(
    ({ text }, index) => index > 0 && text.trim() === '---',
  );
  return end === -1 ? lines : lines.slice(end + 1);
}

/** Whether `line` has a statement, rather than nothing or a comment. */
export function isStatement({ text }: Line): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && !trimmed.startsWith('%%');
}

/**
 * Returns the statement lines of `lines` that aren't in bodies in braces,
 * e.g., the members of classes, which aren't statements of their own.
 *
 * @param opensBody Whether a statement opens a body, rather than, e.g., a
 *   namespace whose lines are statements.
 */
export function statementsOutsideBodies(
  lines: readonly Line[],
  opensBody: (text: string) => boolean,
): Line[] {
  const result: Line[] = [];
  let inBody = false;
  for (const line of lines.filter(isStatement)) {
    const text = line.text.trim();
    if (inBody) {
      inBody = !text.startsWith('}');
      continue;
    }
    result.push(line);
    inBody = text.endsWith('{') && opensBody(text);
  }
  return result;
}

/**
 * Parses `text` alone, after the `header` of a diagram, e.g., `flowchart LR`,
 * trying each of `closers` after it to close a block that it opens.
 *
 * @returns The model, if the text is a diagram of `type`.
 */
export function parseAlone<Type extends DiagramModel['type']>(
  header: string,
  text: string,
  type: Type,
  closers: readonly string[] = [''],
): Extract<DiagramModel, { type: Type }> | undefined {
  for (const closer of closers) {
    try {
      const model = parse(`${header}\n${text}${closer}`) as DiagramModel;
      if (model.type === type) {
        return model as Extract<DiagramModel, { type: Type }>;
      }
    } catch {
      // Try the next closer.
    }
  }
  return undefined;
}

/** Returns items without any, for an adapter to fill. */
export function emptyItems(): Items {
  return { labels: new Map(), parents: new Map(), ends: new Map() };
}

/** An item that a line of the source of a diagram declares. */
export interface LineItem {
  id: string;
  label: string;
  parent: string | undefined;
}

/**
 * Steps of the items of diagrams that declare one item on each line, like
 * outlines or charts. A statement is about its item, which has its shape
 * data, too, if the type of diagrams has it.
 *
 * @param declared The items in the order that they are declared.
 * @param isItem Whether a statement line declares an item.
 */
export function itemPerLineAdapter(
  declared: readonly LineItem[],
  lines: readonly Line[],
  isItem: (line: Line) => boolean,
): Adapter {
  const items: Items = emptyItems();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id, label, parent } of declared) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
    items.labels.set(id, label);
    if (parent !== undefined) {
      items.parents.set(id, parent);
    }
  }
  items.duplicates = duplicates;
  const itemLines = lines.filter((line) => isStatement(line) && isItem(line));
  const byLine = new Map<number, string>();
  if (itemLines.length === declared.length) {
    itemLines.forEach((line, index) => {
      byLine.set(line.index, declared[index]?.id ?? '');
    });
  }
  const about = (line: Line) => {
    const id = byLine.get(line.index);
    return id === undefined ? undefined : [id];
  };
  return { items, about, shapeDataItem: (line) => about(line)?.[0] };
}
