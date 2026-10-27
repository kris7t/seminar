import type { ClassModel } from 'pele';

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
  { id1, id2 }: ClassModel['relations'][number],
  index: number,
): string {
  return `id_${id1}_${id2}_${String(index + 1)}`;
}

type Note = NonNullable<ReturnType<ClassModel['notes']['get']>>;

/** The notes of `model` in the order that they are written. */
function notesOf(model: ClassModel): Note[] {
  return [...model.notes.values()].sort((a, b) => a.index - b.index);
}

function itemsOf(model: ClassModel): Items {
  const items = emptyItems();
  for (const [id, namespace] of model.namespaces) {
    items.labels.set(id, namespace.label || id);
    if (namespace.parent !== undefined) {
      items.parents.set(id, namespace.parent);
    }
  }
  for (const [id, node] of model.classes) {
    items.labels.set(id, node.label || id);
    if (node.parent !== undefined) {
      items.parents.set(id, node.parent);
    }
  }
  for (const note of notesOf(model)) {
    items.labels.set(note.id, note.text);
    if (note.parent !== undefined) {
      items.parents.set(note.id, note.parent);
    }
    if (note.class !== undefined) {
      const edge = `edgeNote${String(note.index)}`;
      items.labels.set(edge, `${note.text} → ${note.class}`);
      items.ends.set(edge, [note.id, note.class]);
    }
  }
  model.relations.forEach((relation, index) => {
    const id = relationId(relation, index);
    items.labels.set(id, relation.title ?? `${relation.id1} → ${relation.id2}`);
    items.ends.set(id, [relation.id1, relation.id2]);
  });
  return items;
}

/**
 * Finds what each statement line is about. Relations and notes are numbered
 * in the whole diagram, which a statement parsed alone doesn't know, so they
 * are told apart by their ends and the order that they are written in.
 */
function statementsOf(
  model: ClassModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[]> {
  const relations = new Map<string, string[]>();
  model.relations.forEach((relation, index) => {
    const ends = `${relation.id1}\0${relation.id2}`;
    relations.set(ends, [
      ...(relations.get(ends) ?? []),
      relationId(relation, index),
    ]);
  });
  const notes = notesOf(model);
  let nextNote = 0;
  const occurrences = new Map<string, number>();
  // Namespaces in namespaces are named by their paths, e.g., `A.B`, and they
  // can't be parsed alone while empty.
  const namespaces: string[] = [];
  const result = new Map<number, string[]>();
  for (const line of statementsOutsideBodies(lines, (text) =>
    /^class\b/.test(text),
  )) {
    const text = line.text.trim();
    const namespace = /^namespace\s+(\S+?)\s*\{$/.exec(text)?.[1];
    if (namespace !== undefined) {
      namespaces.push([...namespaces.slice(-1), namespace].join('.'));
      result.set(line.index, namespaces.slice(-1));
      continue;
    }
    if (text === '}') {
      namespaces.pop();
      continue;
    }
    const statement = parseAlone(header, text, 'class', ['', '\n}']);
    if (statement === undefined) {
      continue;
    }
    const about: string[] = [];
    if (/^class\b/.test(text)) {
      about.push(...statement.classes.keys());
    }
    for (let i = 0; i < statement.notes.size; i += 1) {
      const note = notes[nextNote];
      nextNote += 1;
      if (note !== undefined) {
        about.push(note.id);
      }
    }
    for (const { id1, id2 } of statement.relations) {
      const ends = `${id1}\0${id2}`;
      const occurrence = occurrences.get(ends) ?? 0;
      occurrences.set(ends, occurrence + 1);
      const id = relations.get(ends)?.[occurrence];
      if (id !== undefined) {
        about.push(id);
      }
    }
    result.set(line.index, about);
  }
  return result;
}

/**
 * Steps of the items of class diagrams. A statement is about its relations,
 * its notes, the classes that it declares with `class`, but not those that it
 * only refers to, e.g., to add members, and the namespace that it opens.
 * Classes and notes are in the namespaces around them.
 */
export function classAdapter(
  model: ClassModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements.get(line.index),
  };
}
