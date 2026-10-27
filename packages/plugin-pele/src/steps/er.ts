import type { ErModel } from 'pele';

import {
  emptyItems,
  parseAlone,
  statementsOutsideBodies,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

/**
 * The names of the entities of `model` by their ids, e.g., `CUSTOMER` for
 * `entity-CUSTOMER-0`. Their elements have their names.
 */
function namesOf(model: ErModel): Map<string, string> {
  return new Map(
    [...model.entities].map(([name, entity]) => [entity.id, name]),
  );
}

/** The ends of `relationship` by the names of its entities. */
function endsOf(
  { entityA, entityB }: ErModel['relationships'][number],
  names: ReadonlyMap<string, string>,
): [start: string, end: string] {
  return [names.get(entityA) ?? entityA, names.get(entityB) ?? entityB];
}

/** The id of the `index`th relationship, as the element of its edge has it. */
function relationshipId(
  { entityA, entityB }: ErModel['relationships'][number],
  index: number,
): string {
  return `id_${entityA}_${entityB}_${String(index)}`;
}

function itemsOf(model: ErModel): Items {
  const items = emptyItems();
  for (const [name, entity] of model.entities) {
    items.labels.set(name, entity.alias || name);
  }
  for (const subgraph of model.subgraphs) {
    items.labels.set(subgraph.id, subgraph.title || subgraph.id);
    for (const member of subgraph.nodes) {
      items.parents.set(member, subgraph.id);
    }
  }
  const names = namesOf(model);
  model.relationships.forEach((relationship, index) => {
    const id = relationshipId(relationship, index);
    const [start, end] = endsOf(relationship, names);
    items.labels.set(id, relationship.roleA || `${start} → ${end}`);
    items.ends.set(id, [start, end]);
  });
  return items;
}

/**
 * Finds what each statement line is about. Relationships are numbered in the
 * whole diagram, and so are the entities in their ids, which a statement
 * parsed alone doesn't know, so they are told apart by their ends and how
 * often they occur.
 */
function statementsOf(
  model: ErModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[]> {
  const names = namesOf(model);
  const relationships = new Map<string, string[]>();
  model.relationships.forEach((relationship, index) => {
    const ends = endsOf(relationship, names).join('\0');
    relationships.set(ends, [
      ...(relationships.get(ends) ?? []),
      relationshipId(relationship, index),
    ]);
  });
  const occurrences = new Map<string, number>();
  const result = new Map<number, string[]>();
  for (const line of statementsOutsideBodies(lines, () => true)) {
    const statement = parseAlone(header, line.text, 'er', ['', '\n}', '\nend']);
    if (statement === undefined) {
      continue;
    }
    if (statement.subgraphs.length > 0) {
      result.set(
        line.index,
        statement.subgraphs.map(({ id }) => id),
      );
      continue;
    }
    if (statement.relationships.length === 0) {
      result.set(line.index, [...statement.entities.keys()]);
      continue;
    }
    const about: string[] = [];
    const statementNames = namesOf(statement);
    for (const relationship of statement.relationships) {
      const ends = endsOf(relationship, statementNames).join('\0');
      const occurrence = occurrences.get(ends) ?? 0;
      occurrences.set(ends, occurrence + 1);
      const id = relationships.get(ends)?.[occurrence];
      if (id !== undefined) {
        about.push(id);
      }
    }
    result.set(line.index, about);
  }
  return result;
}

/**
 * Steps of the items of entity relationship diagrams. A statement is about
 * its relationships, the entities that it declares, e.g., with attributes,
 * but not those that it only relates, and the subgraph that it opens.
 * Entities are in the subgraphs around them.
 */
export function erAdapter(
  model: ErModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements.get(line.index),
  };
}
