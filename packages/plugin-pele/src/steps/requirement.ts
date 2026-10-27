import type { RequirementModel } from 'pele';

import {
  emptyItems,
  parseAlone,
  statementsOutsideBodies,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

/** The id of the `index`th relation, as the element of its edge has it. */
function relationId(
  { src, dst }: RequirementModel['relations'][number],
  index: number,
): string {
  return `${src}-${dst}-${String(index)}`;
}

function itemsOf(model: RequirementModel): Items {
  const items = emptyItems();
  for (const name of [...model.requirements.keys(), ...model.elements.keys()]) {
    items.labels.set(name, name);
  }
  model.relations.forEach((relation, index) => {
    const id = relationId(relation, index);
    items.labels.set(id, `${relation.src} ${relation.type} ${relation.dst}`);
    items.ends.set(id, [relation.src, relation.dst]);
  });
  return items;
}

/**
 * Finds what each statement line is about. Relations are numbered in the
 * whole diagram, in the order that they are written.
 */
function statementsOf(
  model: RequirementModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[]> {
  let next = 0;
  const result = new Map<number, string[]>();
  for (const line of statementsOutsideBodies(lines, () => true)) {
    const statement = parseAlone(header, line.text, 'requirement', ['', '\n}']);
    if (statement === undefined) {
      continue;
    }
    const about = [
      ...statement.requirements.keys(),
      ...statement.elements.keys(),
    ];
    const count = statement.relations.length;
    model.relations.slice(next, next + count).forEach((relation, index) => {
      about.push(relationId(relation, next + index));
    });
    next += count;
    result.set(line.index, about);
  }
  return result;
}

/**
 * Steps of the items of requirement diagrams. A statement is about the
 * requirement or element that it declares, or its relation.
 */
export function requirementAdapter(
  model: RequirementModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements.get(line.index),
  };
}
