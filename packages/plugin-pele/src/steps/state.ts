import type { StateModel } from 'pele';

import {
  emptyItems,
  isStatement,
  parseAlone,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';

type Statement = StateModel['rootDoc'][number];
type StateStatement = Extract<Statement, { stmt: 'state' }>;

interface Transition {
  start: string;
  end: string;
  label: string | undefined;
}

interface Walked {
  /** The states, with their labels and the composite states around them. */
  states: Map<string, { label: string; parent: string | undefined }>;
  /** The transitions, in the order of the ids of their elements. */
  transitions: Transition[];
}

function labelOf(state: StateStatement): string | undefined {
  const { description } = state;
  const text = Array.isArray(description) ? description.join(' ') : description;
  return text === undefined || text === '' ? undefined : text;
}

/** Collects the states and transitions of `doc`, in composite `parent`. */
function walk(
  doc: readonly Statement[],
  parent: string | undefined,
  walked: Walked,
): void {
  const add = (state: StateStatement) => {
    const found = walked.states.get(state.id);
    const label = labelOf(state);
    if (found === undefined) {
      walked.states.set(state.id, { label: label ?? state.id, parent });
    } else if (label !== undefined) {
      found.label = label;
    }
  };
  for (const statement of doc) {
    if (typeof statement !== 'object') {
      continue;
    }
    if (statement.stmt === 'state') {
      add(statement);
      if (statement.doc !== undefined) {
        walk(statement.doc, statement.id, walked);
      }
    } else if (statement.stmt === 'relation') {
      add(statement.state1);
      add(statement.state2);
      walked.transitions.push({
        start: statement.state1.id,
        end: statement.state2.id,
        label: statement.description,
      });
    }
  }
}

function walkModel(model: StateModel): Walked {
  const walked: Walked = { states: new Map(), transitions: [] };
  walk(model.rootDoc, undefined, walked);
  return walked;
}

/** The id of the `index`th transition, as the element of its edge has it. */
function transitionId(index: number): string {
  return `edge${String(index)}`;
}

/** Whether `id` is a start or an end state, written `[*]`, e.g., `root_start`. */
function isPseudoState(id: string): boolean {
  return /_(?:start|end)$/.test(id);
}

function itemsOf({ states, transitions }: Walked): Items {
  const items = emptyItems();
  for (const [id, { label, parent }] of states) {
    items.labels.set(id, isPseudoState(id) ? '[*]' : label);
    if (parent !== undefined) {
      items.parents.set(id, parent);
    }
  }
  transitions.forEach(({ start, end, label }, index) => {
    const id = transitionId(index);
    const name = (state: string) => items.labels.get(state) ?? state;
    items.labels.set(id, label ?? `${name(start)} → ${name(end)}`);
    items.ends.set(id, [start, end]);
  });
  return items;
}

interface StatementItems {
  /** States that the statement declares, e.g., `A: waiting` or `state A {`. */
  declared: string[];
  transitions: string[];
}

/**
 * Finds what each statement line declares and the ids of its transitions in
 * the whole diagram. Start and end states, `[*]`, are named after the
 * composite state around them, which a statement parsed alone doesn't know,
 * and transitions are numbered by their ends and how often they occur.
 */
function statementsOf(
  { transitions }: Walked,
  header: string,
  lines: readonly Line[],
): Map<number, StatementItems> {
  const byEnds = new Map<string, number[]>();
  transitions.forEach(({ start, end }, index) => {
    const ends = `${start}\0${end}`;
    byEnds.set(ends, [...(byEnds.get(ends) ?? []), index]);
  });
  const occurrences = new Map<string, number>();
  const composites: string[] = [];
  const result = new Map<number, StatementItems>();
  for (const line of lines.filter(isStatement)) {
    if (line.text.trim() === '}') {
      composites.pop();
      continue;
    }
    const statement = parseAlone(header, line.text, 'state', ['', '\n}']);
    if (statement === undefined) {
      continue;
    }
    const composite = composites.at(-1) ?? 'root';
    const rename = (id: string) =>
      id.startsWith('root_') && isPseudoState(id)
        ? `${composite}_${id.slice('root_'.length)}`
        : id;
    const items: StatementItems = { declared: [], transitions: [] };
    for (const { start, end } of walkModel(statement).transitions) {
      const ends = `${rename(start)}\0${rename(end)}`;
      const occurrence = occurrences.get(ends) ?? 0;
      occurrences.set(ends, occurrence + 1);
      const index = byEnds.get(ends)?.[occurrence];
      if (index !== undefined) {
        items.transitions.push(transitionId(index));
      }
    }
    for (const declared of statement.rootDoc) {
      if (typeof declared === 'object' && declared.stmt === 'state') {
        items.declared.push(declared.id);
        if (declared.doc !== undefined) {
          composites.push(declared.id);
        }
      }
    }
    result.set(line.index, items);
  }
  return result;
}

/**
 * Steps of the items of state diagrams. A statement is about its transitions,
 * and the states that it declares, e.g., with a description like
 * `A: waiting`, or as a composite state like `state A {`, but not those that
 * it only refers to. States are in the composite states around them.
 */
export function stateAdapter(
  model: StateModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const walked = walkModel(model);
  const statements = statementsOf(walked, header, lines);
  return {
    items: itemsOf(walked),
    about: (line) => {
      const statement = statements.get(line.index);
      return statement === undefined
        ? undefined
        : [...statement.declared, ...statement.transitions];
    },
  };
}
