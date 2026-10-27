import type { ArchitectureModel } from 'pele';

import {
  emptyItems,
  isStatement,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

/** The id of `edge`, as its element has it. */
function edgeId({ lhsId, rhsId }: ArchitectureModel['edges'][number]): string {
  return `${lhsId}-${rhsId}`;
}

function itemsOf(model: ArchitectureModel): Items {
  const items = emptyItems();
  for (const [id, item] of [...model.groups, ...model.nodes]) {
    items.labels.set(id, ('title' in item ? item.title : undefined) ?? id);
    if (item.in !== undefined) {
      items.parents.set(id, item.in);
    }
  }
  for (const edge of model.edges) {
    const id = edgeId(edge);
    items.labels.set(id, edge.title ?? `${edge.lhsId} → ${edge.rhsId}`);
    items.ends.set(id, [edge.lhsId, edge.rhsId]);
  }
  return items;
}

const DECLARATION = /^(?:service|junction|group)\s+([\w-]+)/;

/**
 * Finds what each statement line is about. Statements refer to services and
 * groups declared before them, so they can't be parsed alone, but each of
 * them declares one item or one edge.
 */
function statementsOf(
  model: ArchitectureModel,
  lines: readonly Line[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const edgeLines: Line[] = [];
  for (const line of lines.filter(isStatement)) {
    const text = line.text.trim();
    const declared = DECLARATION.exec(text)?.[1];
    if (declared !== undefined) {
      result.set(line.index, [declared]);
    } else if (text.includes('--')) {
      edgeLines.push(line);
    }
  }
  if (edgeLines.length === model.edges.length) {
    edgeLines.forEach((line, index) => {
      const edge = model.edges[index];
      if (edge !== undefined) {
        result.set(line.index, [edgeId(edge)]);
      }
    });
  }
  return result;
}

/**
 * Steps of the items of architecture diagrams. A statement is about the
 * service, junction, or group that it declares, or its edge. Services and
 * groups are in the groups that they are in.
 */
export function architectureAdapter(
  model: ArchitectureModel,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements.get(line.index),
  };
}
