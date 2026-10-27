import type {
  GanttModel,
  GitModel,
  JourneyModel,
  PacketModel,
  PieModel,
  QuadrantModel,
  RadarModel,
  SankeyModel,
  TimelineModel,
  TreemapModel,
} from 'pele';

import {
  emptyItems,
  isStatement,
  itemPerLineAdapter,
  parseAlone,
  type Adapter,
  type Line,
  type LineItem,
} from './source.ts';

/**
 * Whether `line` starts with one of `keywords`, rather than declaring an
 * item.
 */
function startsWith(line: Line, keywords: readonly string[]): boolean {
  const word = /^[\w-]+/.exec(line.text.trim())?.[0];
  return word !== undefined && keywords.includes(word);
}

/**
 * Returns the items of a chart in sections, each section declared before its
 * first item, e.g., `section Build`. Items before the first section have the
 * empty section.
 */
function inSections(
  entries: readonly { id: string; label: string; section: string }[],
): LineItem[] {
  const declared: LineItem[] = [];
  let section = '';
  for (const { id, label, section: inSection } of entries) {
    if (inSection !== '' && inSection !== section) {
      declared.push({ id: inSection, label: inSection, parent: undefined });
    }
    section = inSection;
    declared.push({ id, label, parent: section === '' ? undefined : section });
  }
  return declared;
}

/** Steps of the slices of pie charts, one on each line. */
export function pieAdapter(model: PieModel, lines: readonly Line[]): Adapter {
  return itemPerLineAdapter(
    [...model.sections.keys()].map((id) => ({
      id,
      label: id,
      parent: undefined,
    })),
    lines,
    (line) => line.text.trim().startsWith('"'),
  );
}

/**
 * Steps of the sections and periods of timelines, one on each line, whose
 * periods are in their sections. Events on lines of their own, like
 * `: Tumblr`, belong to the period before them.
 */
export function timelineAdapter(
  model: TimelineModel,
  lines: readonly Line[],
): Adapter {
  return itemPerLineAdapter(
    inSections(
      model.periods.map(({ text, section }) => ({
        id: text.trim(),
        label: text.trim(),
        section,
      })),
    ),
    lines,
    (line) =>
      !line.text.trim().startsWith(':') &&
      !startsWith(line, ['title', 'accTitle', 'accDescr']),
  );
}

/** Steps of the sections and tasks of user journeys, one on each line. */
export function journeyAdapter(
  model: JourneyModel,
  lines: readonly Line[],
): Adapter {
  return itemPerLineAdapter(
    inSections(
      model.tasks.map(({ task, section }) => ({
        id: task,
        label: task,
        section,
      })),
    ),
    lines,
    (line) => !startsWith(line, ['title', 'accTitle', 'accDescr']),
  );
}

/** Steps of the points of quadrant charts, one on each line. */
export function quadrantAdapter(
  model: QuadrantModel,
  lines: readonly Line[],
): Adapter {
  return itemPerLineAdapter(
    model.points.map(({ text }) => ({
      id: text.text,
      label: text.text,
      parent: undefined,
    })),
    lines,
    (line) => /:\s*\[/.test(line.text),
  );
}

const GANTT_KEYWORDS = [
  'dateFormat',
  'axisFormat',
  'tickInterval',
  'title',
  'accTitle',
  'accDescr',
  'excludes',
  'includes',
  'todayMarker',
  'weekday',
  'weekend',
  'displayMode',
  'inclusiveEndDates',
  'topAxis',
  'click',
];

/**
 * Steps of the sections and tasks of Gantt charts, one on each line, whose
 * tasks are in their sections.
 */
export function ganttAdapter(
  model: GanttModel,
  lines: readonly Line[],
): Adapter {
  return itemPerLineAdapter(
    inSections(
      model.tasks.map(({ id, task, section }) => ({
        id,
        label: task.trim(),
        section,
      })),
    ),
    lines,
    (line) => !startsWith(line, GANTT_KEYWORDS),
  );
}

/** Steps of the fields of packet diagrams, one on each line. */
export function packetAdapter(
  model: PacketModel,
  lines: readonly Line[],
): Adapter {
  return itemPerLineAdapter(
    model.rows.flat().map(({ start, end, label }) => ({
      id: `${String(start)}-${String(end)}`,
      label,
      parent: undefined,
    })),
    lines,
    (line) => /^(?:\d|\+)/.test(line.text.trim()),
  );
}

/** Steps of the curves of radar charts. A statement is about its curves. */
export function radarAdapter(model: RadarModel): Adapter {
  const items = emptyItems();
  for (const { name, label } of model.curves) {
    items.labels.set(name, label);
  }
  return {
    items,
    about: (line) => {
      const text = line.text.trim();
      if (!text.startsWith('curve')) {
        return undefined;
      }
      // Curves are written like `curve a["Label"]{1, 2, 3}, b{3, 2, 1}`.
      return [
        ...text
          .slice('curve'.length)
          .matchAll(/([\w-]+)\s*(?:\[[^\]]*\])?\s*\{/g),
      ].map(([, name]) => name ?? '');
    },
  };
}

/**
 * Steps of the items of treemaps, one on each line, which are in the items
 * that they are indented under.
 */
export function treemapAdapter(
  model: TreemapModel,
  lines: readonly Line[],
): Adapter {
  const declared: LineItem[] = [];
  const visit = (node: TreemapModel['roots'][number], parent?: string) => {
    declared.push({ id: node.name, label: node.name, parent });
    for (const child of node.children ?? []) {
      visit(child, node.name);
    }
  };
  for (const root of model.roots) {
    visit(root);
  }
  return itemPerLineAdapter(declared, lines, (line) =>
    line.text.trim().startsWith('"'),
  );
}

/**
 * Steps of the nodes and links of Sankey diagrams. A line is about its link
 * and the nodes that it mentions first, which have no other declarations.
 */
export function sankeyAdapter(
  model: SankeyModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const items = emptyItems();
  for (const { id } of model.nodes) {
    items.labels.set(id, id);
  }
  for (const { source, target } of model.links) {
    const id = `${source.id}->${target.id}`;
    items.labels.set(id, `${source.id} → ${target.id}`);
    items.ends.set(id, [source.id, target.id]);
  }
  const mentioned = new Set<string>();
  const result = new Map<number, string[]>();
  for (const line of lines.filter(isStatement)) {
    const statement = parseAlone(header, line.text, 'sankey');
    if (statement === undefined) {
      continue;
    }
    const about: string[] = [];
    for (const { source, target } of statement.links) {
      for (const node of [source.id, target.id]) {
        if (!mentioned.has(node)) {
          mentioned.add(node);
          about.push(node);
        }
      }
      about.push(`${source.id}->${target.id}`);
    }
    result.set(line.index, about);
  }
  return { items, about: (line) => result.get(line.index) };
}

/**
 * Steps of the commits and branches of git graphs. A statement is about the
 * commit that it makes, e.g., with `merge`, or the branch that it creates.
 * Commits are in their branches.
 */
export function gitAdapter(model: GitModel, lines: readonly Line[]): Adapter {
  const items = emptyItems();
  const commits = [...model.commits.values()].sort((a, b) => a.seq - b.seq);
  for (const branch of model.branches.keys()) {
    items.labels.set(branch, branch);
  }
  for (const commit of commits) {
    items.labels.set(commit.id, commit.message || commit.id);
    items.parents.set(commit.id, commit.branch);
  }
  const result = new Map<number, string[]>();
  let next = 0;
  for (const line of lines.filter(isStatement)) {
    const text = line.text.trim();
    const branch = /^branch\s+(\S+)/.exec(text)?.[1];
    if (branch !== undefined) {
      result.set(line.index, [branch]);
    } else if (/^(?:commit|merge|cherry-pick)\b/.test(text)) {
      const commit = commits[next];
      next += 1;
      result.set(line.index, commit === undefined ? [] : [commit.id]);
    }
  }
  return {
    items,
    about: (line) =>
      next === commits.length ? result.get(line.index) : undefined,
  };
}
