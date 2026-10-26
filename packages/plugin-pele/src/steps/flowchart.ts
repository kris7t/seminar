import type { FlowchartModel } from 'pele';

import {
  emptyItems,
  isStatement,
  parseAlone,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

/** A label that marks a node whose id a statement doesn't show plainly. */
const MARKER = 'seminar-step-marker';

/** Parses a statement alone, closing a subgraph that it opens. */
function parseStatement(
  header: string,
  text: string,
): FlowchartModel | undefined {
  return parseAlone(header, text, 'flowchart', ['', '\nend']);
}

function itemsOf(model: FlowchartModel): Items {
  const items = emptyItems();
  for (const [id, node] of model.nodes) {
    items.labels.set(id, node.text ?? id);
  }
  for (const subgraph of model.subgraphs) {
    items.labels.set(subgraph.id, subgraph.title || subgraph.id);
    for (const member of subgraph.nodes) {
      items.parents.set(member, subgraph.id);
    }
  }
  for (const edge of model.edges) {
    const id = edge.id ?? '';
    items.labels.set(id, edge.text || `${edge.start} → ${edge.end}`);
    items.ends.set(id, [edge.start, edge.end]);
  }
  return items;
}

/**
 * Returns the ids of the edges of each statement line in the whole diagram.
 * Edges without an id of their own are numbered by their ends and how often
 * they occur, which a statement parsed alone doesn't know.
 */
function edgesOfLines(
  model: FlowchartModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[]> {
  const occurrences = new Map<string, number>();
  const unnamed = new Map<string, string[]>();
  for (const edge of model.edges) {
    if (!edge.isUserDefinedId) {
      const ends = `${edge.start}\0${edge.end}`;
      unnamed.set(ends, [...(unnamed.get(ends) ?? []), edge.id ?? '']);
    }
  }
  const result = new Map<number, string[]>();
  for (const line of lines.filter(isStatement)) {
    const statement = parseStatement(header, line.text);
    if (statement === undefined) {
      continue;
    }
    result.set(
      line.index,
      statement.edges.map((edge) => {
        if (edge.isUserDefinedId) {
          return edge.id ?? '';
        }
        const ends = `${edge.start}\0${edge.end}`;
        const occurrence = occurrences.get(ends) ?? 0;
        occurrences.set(ends, occurrence + 1);
        return unnamed.get(ends)?.[occurrence] ?? '';
      }),
    );
  }
  return result;
}

/**
 * Steps of the items of flowcharts. A statement is about its edges, the nodes
 * that it gives a label or a shape, but not those that it only refers to, and
 * the subgraph that it opens. Items are in the subgraphs around them.
 */
export function flowchartAdapter(
  model: FlowchartModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const edges = edgesOfLines(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => {
      const statement = parseStatement(header, line.text);
      if (statement === undefined) {
        return undefined;
      }
      return [
        ...[...statement.nodes.values()]
          .filter((node) => node.type !== undefined)
          .map((node) => node.id),
        ...statement.subgraphs.map((subgraph) => subgraph.id),
        ...(edges.get(line.index) ?? []),
      ];
    },
    shapeDataItem: (_line, before, after) => {
      // An id right before the shape data, e.g., `B@{ … }` or `e1@{ … }`.
      const id = /[\w-]+$/.exec(before)?.[0];
      if (id !== undefined) {
        return id;
      }
      // After a label, e.g., `B[Parser]@{ … }`, whose node gets the marker.
      const marked = parseStatement(
        header,
        `${before}@{ label: "${MARKER}" }${after}`,
      );
      return [...(marked?.nodes.values() ?? [])].find(
        (node) => node.text === MARKER,
      )?.id;
    },
  };
}
