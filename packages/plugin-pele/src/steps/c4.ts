import type { C4Model } from 'pele';

import {
  emptyItems,
  isStatement,
  parseAlone,
  type Adapter,
  type Items,
} from './source.ts';

/** The boundary around the whole diagram, which has no element. */
const GLOBAL = 'global';

/**
 * The id of the relation from `from` to `to`, as the element of its edge has
 * it. There is one relation between two elements, the last one written.
 */
function relationId({ from, to }: C4Model['rels'][number]): string {
  return `${from}-${to}`;
}

function itemsOf(model: C4Model): Items {
  const items = emptyItems();
  for (const element of [...model.boundaries, ...model.shapes]) {
    if (element.alias === GLOBAL) {
      continue;
    }
    items.labels.set(element.alias, element.label || element.alias);
    const parent = element.parent?.alias;
    if (parent !== undefined && parent !== GLOBAL) {
      items.parents.set(element.alias, parent);
    }
  }
  for (const relation of model.rels) {
    const id = relationId(relation);
    items.labels.set(id, relation.label || `${relation.from} → ${relation.to}`);
    items.ends.set(id, [relation.from, relation.to]);
  }
  return items;
}

/**
 * The alias of the boundary that a statement opens, e.g.,
 * `System_Boundary(b, "Bank") {`.
 */
const BOUNDARY = /^\w+\(\s*"?([^",)\s]+)[^{]*\{$/;

/**
 * Steps of the items of C4 diagrams. A statement is about the element or the
 * relation that it declares, or the boundary that it opens. Elements are in
 * the boundaries around them.
 */
export function c4Adapter(model: C4Model, header: string): Adapter {
  return {
    items: itemsOf(model),
    about: (line) => {
      const text = line.text.trim();
      // Boundaries can't be parsed alone while empty.
      const boundary = BOUNDARY.exec(text)?.[1];
      if (boundary !== undefined) {
        return [boundary];
      }
      const statement = isStatement(line)
        ? parseAlone(header, text, 'c4')
        : undefined;
      return statement === undefined
        ? undefined
        : [
            ...statement.shapes.map(({ alias }) => alias),
            ...statement.rels.map(relationId),
          ];
    },
  };
}
