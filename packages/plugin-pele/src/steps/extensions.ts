import type {
  CynefinModel,
  EventModelingModel,
  IshikawaModel,
  RailroadModel,
  TreeViewModel,
  UsecaseModel,
  VennModel,
  WardleyModel,
} from 'pele';

import {
  emptyItems,
  isStatement,
  itemPerLineAdapter,
  parseAlone,
  statementsOutsideBodies,
  type Adapter,
  type Line,
  type LineItem,
} from './source.ts';

/*
 * Steps of the items of the types of diagrams that Pele has besides those of
 * Mermaid.
 */

/**
 * Steps of the files and directories of tree views, one on each line, which
 * are in the directories that they are indented under.
 */
export function treeViewAdapter(
  model: TreeViewModel,
  lines: readonly Line[],
): Adapter {
  const declared: LineItem[] = [];
  const visit = (node: TreeViewModel['root'], parent?: string) => {
    declared.push({ id: node.name, label: node.name, parent });
    for (const child of node.children) {
      visit(child, node.name);
    }
  };
  // The root, `/`, is implicit.
  for (const child of model.root.children) {
    visit(child);
  }
  return itemPerLineAdapter(declared, lines, () => true);
}

/**
 * Steps of the categories of Ishikawa diagrams, one on each line, with their
 * causes, which have no elements of their own.
 */
export function ishikawaAdapter(
  model: IshikawaModel,
  lines: readonly Line[],
): Adapter {
  const declared: LineItem[] = [];
  const categories = new Set<string>();
  const visit = (node: NonNullable<IshikawaModel['root']>, depth: number) => {
    declared.push({ id: node.text, label: node.text, parent: undefined });
    if (depth === 1) {
      categories.add(node.text);
    }
    for (const child of node.children) {
      visit(child, depth + 1);
    }
  };
  if (model.root !== undefined) {
    visit(model.root, 0);
  }
  const adapter = itemPerLineAdapter(declared, lines, () => true);
  return {
    ...adapter,
    about: (line) => adapter.about(line)?.filter((id) => categories.has(id)),
  };
}

const CYNEFIN_DOMAINS = [
  'complex',
  'complicated',
  'clear',
  'chaotic',
  'confusion',
];

/**
 * Steps of the domains, items, and transitions of Cynefin diagrams. A
 * statement is about the domain that it opens, its item, or its transition.
 * Items are in their domains.
 */
export function cynefinAdapter(model: CynefinModel): Adapter {
  const items = emptyItems();
  for (const [name, domain] of model.domains) {
    items.labels.set(name, name);
    for (const { label } of domain.items) {
      items.labels.set(label, label);
      items.parents.set(label, name);
    }
  }
  for (const { from, to, label } of model.transitions) {
    const id = `${from}-${to}`;
    items.labels.set(id, label ?? `${from} → ${to}`);
    items.ends.set(id, [from, to]);
  }
  return {
    items,
    about: (line) => {
      const text = line.text.trim();
      if (CYNEFIN_DOMAINS.includes(text)) {
        return [text];
      }
      const item = /^"(.*)"$/.exec(text)?.[1];
      if (item !== undefined) {
        return [item];
      }
      const transition = /^(\w+)\s*-->\s*(\w+)/.exec(text);
      return transition === null
        ? undefined
        : [`${transition[1] ?? ''}-${transition[2] ?? ''}`];
    },
  };
}

/**
 * Steps of the components and links of Wardley maps. A statement is about the
 * anchor or component that it declares, with its evolution, or its link.
 */
export function wardleyAdapter(model: WardleyModel, header: string): Adapter {
  const items = emptyItems();
  for (const { id, label } of model.nodes) {
    items.labels.set(id, label);
  }
  for (const { source, target } of model.links) {
    const id = `${source}-${target}`;
    items.labels.set(id, `${source} → ${target}`);
    items.ends.set(id, [source, target]);
  }
  return {
    items,
    about: (line) => {
      const text = line.text.trim();
      const declared = /^(?:anchor|component)\s+(.+?)\s*\[/.exec(text)?.[1];
      if (declared !== undefined) {
        return [declared];
      }
      const statement = isStatement(line)
        ? parseAlone(header, text, 'wardley')
        : undefined;
      return statement?.links.map(
        ({ source, target }) => `${source}-${target}`,
      );
    },
  };
}

/**
 * Steps of the boxes of event models, one on each time frame. Their relations
 * are shown with the later of their boxes.
 */
export function eventModelingAdapter(model: EventModelingModel): Adapter {
  const items = emptyItems();
  for (const { id, name } of model.boxes) {
    items.labels.set(id, name);
  }
  for (const { source, target } of model.relations) {
    const id = `${source.id}-${target.id}`;
    items.labels.set(id, `${source.name} → ${target.name}`);
    items.ends.set(id, [source.id, target.id]);
  }
  return {
    items,
    about: (line) => {
      const frame = /^(?:timeframe|tf)\s+(\S+)/.exec(line.text.trim())?.[1];
      return frame === undefined ? undefined : [frame];
    },
  };
}

/** Steps of the sets and unions of Venn diagrams, one on each line. */
export function vennAdapter(model: VennModel, lines: readonly Line[]): Adapter {
  return itemPerLineAdapter(
    model.subsets.map(({ sets, label }) => {
      const id = sets.join('|');
      return { id, label: label ?? id, parent: undefined };
    }),
    lines,
    (line) => /^(?:set|union)\b/.test(line.text.trim()),
  );
}

/**
 * Steps of the rules of railroad diagrams. A statement is about the rule that
 * it starts, without the references to it in other rules.
 */
export function railroadAdapter(model: RailroadModel): Adapter {
  const items = emptyItems();
  for (const { name } of model.rules) {
    items.labels.set(name, name);
  }
  return {
    items,
    about: (line) => {
      const rule = /^<?([\w-]+)>?\s*(?:::=|=|<-|:)/.exec(line.text.trim())?.[1];
      return rule !== undefined && items.labels.has(rule) ? [rule] : undefined;
    },
  };
}

/**
 * Steps of the items of use case diagrams. A statement is about its
 * relationships, the actors and use cases that it declares, but not those
 * that it only relates, or the system boundary that it opens. Use cases are
 * in their system boundaries.
 */
export function usecaseAdapter(
  model: UsecaseModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const items = emptyItems();
  for (const [id, { label }] of [
    ...model.systemBoundaries,
    ...model.actors,
    ...model.useCases,
  ]) {
    items.labels.set(id, label);
  }
  for (const [id, { parentId }] of [...model.actors, ...model.useCases]) {
    if (parentId !== undefined) {
      items.parents.set(id, parentId);
    }
  }
  for (const { id, source, target, label } of model.relationships) {
    items.labels.set(id, label ?? `${source} → ${target}`);
    items.ends.set(id, [source, target]);
  }
  // Relationships are numbered in the whole diagram, unless they have ids.
  let next = 0;
  const result = new Map<number, string[]>();
  for (const line of statementsOutsideBodies(lines, () => true)) {
    const statement = parseAlone(header, line.text, 'usecase', ['', '\nend']);
    if (statement === undefined) {
      continue;
    }
    if (statement.relationships.length === 0) {
      result.set(line.index, [
        ...statement.systemBoundaries.keys(),
        ...statement.actors.keys(),
        ...statement.useCases.keys(),
      ]);
      continue;
    }
    const count = statement.relationships.length;
    result.set(
      line.index,
      model.relationships.slice(next, next + count).map(({ id }) => id),
    );
    next += count;
  }
  return { items, about: (line) => result.get(line.index) };
}
