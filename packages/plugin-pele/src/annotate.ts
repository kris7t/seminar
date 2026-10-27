import { parse } from 'pele/core';

/** The id of the `index`th series of an XY chart, from 0. */
export function seriesId(index: number): string {
  return `series-${String(index + 1)}`;
}

import {
  BLOCK_ENDS,
  BLOCK_STARTS,
  messageId,
  RECT_START,
} from './sequenceMessages.ts';

/**
 * Gives the frames of the blocks of a sequence diagram, e.g., of `loop`, the
 * id of the statement that starts them, like their messages have, so that
 * steps can show them. Pele draws them in the order of their ends, except
 * those of `rect`.
 */
function annotateFrames(svg: string, source: string): string {
  const model = parse(source);
  if (model.type !== 'sequence') {
    return svg;
  }
  const open: { id: string; type: number }[] = [];
  const frames: string[] = [];
  for (const { id, type } of model.messages) {
    if (type !== undefined && BLOCK_STARTS.has(type)) {
      open.push({ id, type });
    } else if (type !== undefined && BLOCK_ENDS.has(type)) {
      const start = open.pop();
      if (start !== undefined && start.type !== RECT_START) {
        frames.push(messageId(start.id));
      }
    }
  }
  const pattern = /<g class="pele-frame /g;
  if ((svg.match(pattern) ?? []).length !== frames.length) {
    return svg;
  }
  let index = 0;
  return svg.replaceAll(
    pattern,
    (match) => `<g data-id="${frames[index++] ?? ''}"${match.slice(2)}`,
  );
}

/**
 * Gives the series of an XY chart ids by their order, like `series-1`, which
 * is also the order of their colors, e.g., `--pele-series-1`.
 */
function annotateSeries(svg: string): string {
  let index = 0;
  return svg.replaceAll(
    /<g class="pele-series /g,
    (match) => `<g data-id="${seriesId(index++)}"${match.slice(2)}`,
  );
}

/**
 * Moves the ids of the references to rules of a railroad diagram to
 * `data-rule`, so that the id of a rule is only on the rule, which steps
 * show without the references to it in other rules.
 */
function annotateReferences(svg: string): string {
  return svg.replaceAll(
    /(<g class="pele-node pele-nonterminal"[^>]*?) data-id=/g,
    '$1 data-rule=',
  );
}

/** Returns the box of `element` in the coordinates of its parent. */
function boxOf(element: SVGGraphicsElement): DOMRect {
  const box = element.getBBox();
  const translation = element.transform.baseVal.consolidate()?.matrix;
  return new DOMRect(
    box.x + (translation?.e ?? 0),
    box.y + (translation?.f ?? 0),
    box.width,
    box.height,
  );
}

function distance(box: DOMRect, { x, y }: DOMPoint): number {
  return Math.hypot(
    Math.max(box.left - x, 0, x - box.right),
    Math.max(box.top - y, 0, y - box.bottom),
  );
}

/**
 * Gives the edges of a mind map the id of the node that they lead to, which
 * they end at, so that they're shown with it. Measures the diagram in a
 * hidden element of the document.
 */
function annotateEdges(svg: string): string {
  // Not every environment measures SVG, e.g., jsdom.
  if (
    typeof SVGGraphicsElement === 'undefined' ||
    typeof SVGGraphicsElement.prototype.getBBox !== 'function'
  ) {
    return svg;
  }
  const container = document.createElement('div');
  container.style.cssText =
    'position: fixed; left: -100000px; top: 0; visibility: hidden;';
  container.innerHTML = svg;
  document.body.append(container);
  try {
    const nodes = [
      ...container.querySelectorAll<SVGGraphicsElement>('.pele-node[data-id]'),
    ].map((node) => ({ id: node.dataset['id'] ?? '', box: boxOf(node) }));
    for (const edge of container.querySelectorAll<SVGPathElement>(
      'path.pele-edge',
    )) {
      const end = edge.getPointAtLength(edge.getTotalLength());
      let nearest: (typeof nodes)[number] | undefined;
      for (const node of nodes) {
        if (
          nearest === undefined ||
          distance(node.box, end) < distance(nearest.box, end)
        ) {
          nearest = node;
        }
      }
      if (nearest !== undefined) {
        edge.dataset['id'] = nearest.id;
      }
    }
    return container.innerHTML;
  } finally {
    container.remove();
  }
}

/**
 * Gives the elements of a diagram of `type` that Pele renders without an id
 * the ids that steps of their items need, e.g., the frames of the blocks of
 * sequence diagrams, the edges of mind maps, and the series of XY charts.
 */
export function annotate(svg: string, type: string, source: string): string {
  switch (type) {
    case 'sequence':
      return annotateFrames(svg, source);
    case 'mindmap':
      return annotateEdges(svg);
    case 'xychart':
      return annotateSeries(svg);
    case 'railroad':
      return annotateReferences(svg);
    default:
      return svg;
  }
}
