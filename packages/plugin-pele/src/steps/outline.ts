import type { KanbanModel, MindmapModel } from 'pele';

import {
  itemPerLineAdapter,
  type Adapter,
  type Line,
  type LineItem,
} from './source.ts';

/**
 * Steps of the items of mind maps, one on each line, which are in the items
 * that they are indented under. Their edges are shown with the nodes that
 * they lead to.
 */
export function mindmapAdapter(
  model: MindmapModel,
  lines: readonly Line[],
): Adapter {
  const outline: LineItem[] = [];
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
  return itemPerLineAdapter(
    outline,
    lines,
    (line) => !line.text.trim().startsWith('::'),
  );
}

/**
 * Steps of the items of kanban boards, one on each line, whose cards are in
 * their columns.
 */
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
  return itemPerLineAdapter(outline, lines, () => true);
}
