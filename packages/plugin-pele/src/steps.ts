import { getStepProps, parseAttributeWords } from '@seminar/mdx';
import { parse, type FlowchartModel } from 'pele';
import type { VFile } from 'vfile';

import type { DiagramStep } from './Diagram.tsx';

/** Reports a problem with the steps of a diagram on a line of its source. */
export type StepReporter = (message: string, line: number) => void;

interface Line {
  /** Index of the line in the source, from 0. */
  index: number;
  text: string;
}

/** A step written in the source: its items, attributes, and line. */
interface Annotation {
  items: string[];
  attributes: string;
  line: number;
}

/**
 * The items of a diagram, i.e., its nodes, clusters, and edges, by their ids,
 * which are the `data-id` of their elements, and how they are related.
 */
interface Items {
  /** Labels of the items, e.g., for the titles of steps. */
  labels: Map<string, string>;
  /** The cluster that an item is in, if any. */
  parents: Map<string, string>;
  /** The ends of the edges. */
  ends: Map<string, [start: string, end: string]>;
}

/** Matches a step in a comment, e.g., `%% step[C, B->C] only`. */
const STEP_COMMENT = /^%%\s*step(?:\[([^\]]*)\])?(?:\s+(.*))?$/;

/** Returns the lines of `source` after its frontmatter, e.g., of `config`. */
function linesOf(source: string): Line[] {
  const lines = source.split('\n').map((text, index) => ({ index, text }));
  if (lines[0]?.text.trim() !== '---') {
    return lines;
  }
  const end = lines.findIndex(
    ({ text }, index) => index > 0 && text.trim() === '---',
  );
  return end === -1 ? lines : lines.slice(end + 1);
}

function isStatement({ text }: Line): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && !trimmed.startsWith('%%');
}

/** Returns the flowchart in `source`, parsed alone, if it can be. */
function parseFlowchart(source: string): FlowchartModel | undefined {
  try {
    const model = parse(source);
    return model.type === 'flowchart' ? model : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parses the statement on `line` alone, after the `header` of the diagram,
 * closing a subgraph that it opens.
 */
function parseStatement(
  header: string,
  line: Line,
): FlowchartModel | undefined {
  const source = `${header}\n${line.text}`;
  return parseFlowchart(source) ?? parseFlowchart(`${source}\nend`);
}

function flowchartItems(model: FlowchartModel): Items {
  const items: Items = {
    labels: new Map(),
    parents: new Map(),
    ends: new Map(),
  };
  for (const [id, node] of model.nodes) {
    items.labels.set(id, node.text ?? id);
  }
  for (const subgraph of model.subgraphs) {
    items.labels.set(subgraph.id, subgraph.title || subgraph.id);
    for (const member of subgraph.nodes) {
      items.parents.set(member, subgraph.id);
    }
  }
  for (const edge of model.edges) {
    const id = edge.id ?? '';
    items.labels.set(id, edge.text || `${edge.start} → ${edge.end}`);
    items.ends.set(id, [edge.start, edge.end]);
  }
  return items;
}

/**
 * Returns the ids of the edges of each statement line in the whole diagram.
 * Edges without an id of their own are numbered by their ends and how often
 * they occur, which a statement parsed alone doesn't know.
 */
function edgesOfLines(
  model: FlowchartModel,
  header: string,
  lines: Line[],
): Map<number, string[]> {
  const occurrences = new Map<string, number>();
  const unnamed = new Map<string, string[]>();
  for (const edge of model.edges) {
    if (!edge.isUserDefinedId) {
      const ends = `${edge.start}\0${edge.end}`;
      unnamed.set(ends, [...(unnamed.get(ends) ?? []), edge.id ?? '']);
    }
  }
  const result = new Map<number, string[]>();
  for (const line of lines.filter(isStatement)) {
    const statement = parseStatement(header, line);
    if (statement === undefined) {
      continue;
    }
    result.set(
      line.index,
      statement.edges.map((edge) => {
        if (edge.isUserDefinedId) {
          return edge.id ?? '';
        }
        const ends = `${edge.start}\0${edge.end}`;
        const occurrence = occurrences.get(ends) ?? 0;
        occurrences.set(ends, occurrence + 1);
        return unnamed.get(ends)?.[occurrence] ?? '';
      }),
    );
  }
  return result;
}

/**
 * Returns the items that a statement is about: its edges, the nodes that it
 * gives a label or a shape, but not those that it only refers to, and the
 * subgraphs that it opens.
 */
function aboutStatement(
  header: string,
  line: Line,
  edges: Map<number, string[]>,
): string[] | undefined {
  const statement = parseStatement(header, line);
  if (statement === undefined) {
    return undefined;
  }
  return [
    ...[...statement.nodes.values()]
      .filter((node) => node.type !== undefined)
      .map((node) => node.id),
    ...statement.subgraphs.map((subgraph) => subgraph.id),
    ...(edges.get(line.index) ?? []),
  ];
}

/**
 * Finds the end of the shape data that starts at `start`, after `@{`, and
 * returns its entries, e.g., `[['shape', 'rect'], ['step', 'only']]`.
 */
function shapeData(
  text: string,
  start: number,
): { entries: [string, string][]; end: number } | undefined {
  const entries: [string, string][] = [];
  let entry = '';
  let quote: string | undefined;
  const push = () => {
    const separator = entry.indexOf(':');
    const key = (separator === -1 ? entry : entry.slice(0, separator)).trim();
    const value = separator === -1 ? '' : entry.slice(separator + 1).trim();
    if (key !== '') {
      entries.push([key, value.replace(/^(["'])(.*)\1$/, '$2')]);
    }
    entry = '';
  };
  for (let index = start; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
      entry += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      entry += character;
    } else if (character === ',') {
      push();
    } else if (character === '}') {
      push();
      return { entries, end: index };
    } else {
      entry += character;
    }
  }
  return undefined;
}

/** A label that marks a node whose id a statement doesn't show plainly. */
const MARKER = 'seminar-step-marker';

/**
 * Finds the steps in the shape data of nodes and edges, e.g., `B@{ step }`,
 * or `B[Parser]@{ step }` after the label of a node, whose id is found by
 * parsing the statement with a marker as the label instead.
 */
function shapeDataSteps(header: string, line: Line): Annotation[] {
  const annotations: Annotation[] = [];
  const pattern = /@\{/g;
  for (
    let match = pattern.exec(line.text);
    match !== null;
    match = pattern.exec(line.text)
  ) {
    const data = shapeData(line.text, match.index + match[0].length);
    if (data === undefined) {
      break;
    }
    pattern.lastIndex = data.end;
    const step = data.entries.find(([key]) => key === 'step');
    if (step === undefined) {
      continue;
    }
    const before = line.text.slice(0, match.index);
    let id = /[\w-]+$/.exec(before)?.[0];
    if (!/[\w-]$/.test(before)) {
      const marked = parseStatement(header, {
        index: line.index,
        text: `${before}@{ label: "${MARKER}" }${line.text.slice(data.end + 1)}`,
      });
      id = [...(marked?.nodes.values() ?? [])].find(
        (node) => node.text === MARKER,
      )?.id;
    }
    if (id !== undefined) {
      annotations.push({
        items: [id],
        attributes: step[1] === 'true' ? '' : step[1],
        line: line.index,
      });
    }
  }
  return annotations;
}

/** Returns the items that `target` stands for, e.g., all edges for `A->B`. */
function resolveTarget(target: string, items: Items): string[] {
  const arrow = target.indexOf('->');
  if (arrow === -1) {
    return items.labels.has(target) ? [target] : [];
  }
  const start = target.slice(0, arrow);
  const end = target.slice(arrow + 2);
  return [...items.ends]
    .filter(([, ends]) => ends[0] === start && ends[1] === end)
    .map(([id]) => id);
}

/**
 * Finds the steps of the items of a flowchart in its `source`, written in
 * their shape data, e.g., `B[Parser]@{ step: "group=emit" }`, or in comments:
 * `%% step …` before a statement for what the statement is about, or
 * `%% step[C, B->C] …` for the items in the brackets. Their attributes are
 * those of `:step`.
 *
 * Steps are nested in the steps of the subgraphs that their items are in.
 * Items without a step of their own are shown with the subgraph around them,
 * and edges with the later of their ends, unless they have steps of their
 * own.
 */
export function findSteps(
  source: string,
  file: VFile,
  report: StepReporter,
): DiagramStep[] {
  const model = parseFlowchart(source);
  const lines = linesOf(source);
  const header = lines.find(isStatement);
  const annotations: Annotation[] = [];
  if (model === undefined || header === undefined) {
    for (const line of lines) {
      if (STEP_COMMENT.test(line.text.trim())) {
        report('Steps of items are only supported in flowcharts', line.index);
      }
    }
    return [];
  }
  const items = flowchartItems(model);
  const edges = edgesOfLines(model, header.text, lines);
  lines.forEach((line, position) => {
    const comment = STEP_COMMENT.exec(line.text.trim());
    if (comment === null) {
      if (isStatement(line)) {
        annotations.push(...shapeDataSteps(header.text, line));
      }
      return;
    }
    const [, targets, attributes = ''] = comment;
    if (targets !== undefined) {
      const resolved = targets
        .split(/[\s,]+/)
        .filter((target) => target !== '')
        .flatMap((target) => {
          const found = resolveTarget(target, items);
          if (found.length === 0) {
            report(`The diagram has no \`${target}\` to step`, line.index);
          }
          return found;
        });
      if (resolved.length > 0) {
        annotations.push({ items: resolved, attributes, line: line.index });
      }
      return;
    }
    const next = lines.slice(position + 1).find(isStatement);
    const about =
      next === undefined ? undefined : aboutStatement(header.text, next, edges);
    if (about === undefined || about.length === 0) {
      report(
        'Cannot tell what the step is about, list its items like `%% step[A, A->B]`',
        line.index,
      );
      return;
    }
    annotations.push({ items: about, attributes, line: line.index });
  });
  return stepsOf(annotations, items, file, report);
}

/** Builds the steps of `annotations`, nested by the clusters of the items. */
function stepsOf(
  annotations: Annotation[],
  items: Items,
  file: VFile,
  report: StepReporter,
): DiagramStep[] {
  const own = new Map<string, number>();
  annotations.forEach(({ items: stepped, line }, index) => {
    for (const item of stepped) {
      if (own.has(item)) {
        report(`\`${item}\` is already shown in an earlier step`, line);
      } else {
        own.set(item, index);
      }
    }
  });
  // The step that shows an item that isn't an edge, or -1 for the diagram.
  const stepOf = (item: string | undefined): number => {
    for (let at = item; at !== undefined; at = items.parents.get(at)) {
      const index = own.get(at);
      if (index !== undefined) {
        return index;
      }
    }
    return -1;
  };
  const shownIn = new Map<string, number>();
  for (const item of items.labels.keys()) {
    const ends = items.ends.get(item);
    shownIn.set(
      item,
      ends === undefined
        ? stepOf(item)
        : (own.get(item) ?? Math.max(stepOf(ends[0]), stepOf(ends[1]))),
    );
    const step = own.get(item);
    if (
      ends !== undefined &&
      step !== undefined &&
      stepOf(ends[0]) > step &&
      stepOf(ends[1]) > step
    ) {
      report(
        `The edge \`${item}\` is shown before both of its ends`,
        annotations[step]?.line ?? 0,
      );
    }
  }
  const steps: (DiagramStep & { steps: DiagramStep[] })[] = annotations.map(
    ({ items: stepped, attributes, line }, index) => {
      const { attributes: parsed } = parseAttributeWords(attributes);
      if (parsed.id !== undefined || parsed.classes.length > 0) {
        report('Steps of items take no `#id` or `.class`', line);
      }
      const props = Object.fromEntries(
        getStepProps({ ...parsed, id: undefined, classes: [] }, file),
      );
      props['title'] ??= stepped
        .map((item) => items.labels.get(item) ?? item)
        .join(', ');
      return {
        items: [...shownIn]
          .filter(([, step]) => step === index)
          .map(([item]) => item),
        props,
        steps: [],
      };
    },
  );
  const roots: DiagramStep[] = [];
  annotations.forEach(({ items: stepped }, index) => {
    const step = steps[index];
    if (step === undefined) {
      return;
    }
    // The step of the nearest cluster around the items that has another one.
    let parent = -1;
    for (
      let at = items.parents.get(stepped[0] ?? '');
      at !== undefined && parent === -1;
      at = items.parents.get(at)
    ) {
      const found = own.get(at);
      if (found !== undefined && found !== index) {
        parent = found;
      }
    }
    (steps[parent]?.steps ?? roots).push(step);
  });
  return roots;
}
