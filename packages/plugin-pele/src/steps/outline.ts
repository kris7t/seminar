import type { KanbanModel, MindmapModel } from 'pele';

import {
  emptyItems,
  isStatement,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

/** An item of an outline, i.e., a diagram written as an indented list. */
interface OutlineItem {
  id: string;
  label: string;
  parent: string | undefined;
}

/**
 * Steps of the items of diagrams written as outlines, one item on each line,
 * which are in the items that they are indented under. A statement is about
 * its item, which has its shape data, too.
 */
function outlineAdapter(
  outline: readonly OutlineItem[],
  lines: readonly Line[],
  isItem: (line: Line) => boolean,
): Adapter {
  const items: Items = emptyItems();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id, label, parent } of outline) {
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
  if (itemLines.length === outline.length) {
    itemLines.forEach((line, index) => {
      byLine.set(line.index, outline[index]?.id ?? '');
    });
  }
  const about = (line: Line) => {
    const id = byLine.get(line.index);
    return id === undefined ? undefined : [id];
  };
  return { items, about, shapeDataItem: (line) => about(line)?.[0] };
}

/**
 * Steps of the items of mind maps. Their edges are shown with the nodes that
 * they lead to.
 */
export function mindmapAdapter(
  model: MindmapModel,
  lines: readonly Line[],
): Adapter {
  const outline: OutlineItem[] = [];
  const visit = (node: MindmapModel['nodes'][number], parent?: string) => {
    outline.push({ id: node.nodeId, label: node.descr, parent });
    for (const child of node.children) {
      visit(child, node.nodeId);
    }
  };
  const [root] = model.nodes;
  if (root !== undefined) {
    visit(root);
  }
  // Icons and classes, like `::icon(…)`, belong to the node before them.
  return outlineAdapter(
    outline,
    lines,
    (line) => !line.text.trim().startsWith('::'),
  );
}

/** Steps of the items of kanban boards, whose cards are in their columns. */
export function kanbanAdapter(
  model: KanbanModel,
  lines: readonly Line[],
): Adapter {
  const outline = model.sections.flatMap((section) => [
    { id: section.id, label: section.label, parent: undefined },
    ...section.items.map((item) => ({
      id: item.id,
      label: item.label,
      parent: section.id,
    })),
  ]);
  return outlineAdapter(outline, lines, () => true);
}
