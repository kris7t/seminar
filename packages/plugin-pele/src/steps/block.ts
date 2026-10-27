import type { BlockModel } from 'pele';

import {
  emptyItems,
  isStatement,
  parseAlone,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

type Block = BlockModel['root'];

/**
 * The blocks under `block`, in preorder, without spaces, which have no
 * elements.
 */
function blocksUnder(block: Block): Block[] {
  return (block.children ?? [])
    .filter(({ type }) => type !== 'space')
    .flatMap((child) => [child, ...blocksUnder(child)]);
}

function itemsOf(model: BlockModel): Items {
  const items = emptyItems();
  const visit = (block: Block, parent: string | undefined) => {
    for (const child of block.children ?? []) {
      if (child.type === 'space') {
        continue;
      }
      items.labels.set(
        child.id,
        child.label === undefined || child.label === ''
          ? child.id
          : child.label,
      );
      if (parent !== undefined) {
        items.parents.set(child.id, parent);
      }
      visit(child, child.id);
    }
  };
  visit(model.root, undefined);
  for (const edge of model.edges) {
    const { id, start = '', end = '' } = edge;
    items.labels.set(
      id,
      edge.label === undefined || edge.label === ''
        ? `${start} → ${end}`
        : edge.label,
    );
    items.ends.set(id, [start, end]);
  }
  return items;
}

/**
 * Finds what each statement line is about. Composite blocks may have no ids
 * of their own, and are told apart by the order that they are opened in.
 * Edges are numbered by their ends and how often they occur, like the
 * elements of their edges.
 */
function statementsOf(
  model: BlockModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[]> {
  const composites = blocksUnder(model.root).filter(
    ({ type }) => type === 'composite',
  );
  let nextComposite = 0;
  const occurrences = new Map<string, number>();
  const result = new Map<number, string[]>();
  for (const line of lines.filter(isStatement)) {
    const text = line.text.trim();
    if (text === 'end') {
      continue;
    }
    if (/^block\b/.test(text)) {
      const composite = composites[nextComposite];
      nextComposite += 1;
      result.set(line.index, composite === undefined ? [] : [composite.id]);
      continue;
    }
    const statement = parseAlone(header, text, 'block');
    if (statement === undefined) {
      continue;
    }
    const blocks = blocksUnder(statement.root);
    if (statement.edges.length === 0) {
      result.set(
        line.index,
        blocks.map(({ id }) => id),
      );
      continue;
    }
    const edges = statement.edges.map(({ start = '', end = '' }) => {
      const ends = `${start}-${end}`;
      const occurrence = (occurrences.get(ends) ?? 0) + 1;
      occurrences.set(ends, occurrence);
      return `${String(occurrence)}-${ends}`;
    });
    // Blocks that an edge only refers to don't have a shape or a label.
    result.set(line.index, [
      ...blocks.filter(({ type }) => type !== 'na').map(({ id }) => id),
      ...edges,
    ]);
  }
  return result;
}

/**
 * Steps of the items of block diagrams. A statement is about the blocks that
 * it places, the composite block that it opens, or its edges and the blocks
 * that they give a label or a shape. Blocks are in the composite blocks
 * around them.
 */
export function blockAdapter(
  model: BlockModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements.get(line.index),
  };
}
