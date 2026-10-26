import { getStepProps, parseAttributeWords } from '@seminar/mdx';
import { parse, type DiagramModel } from 'pele';
import type { VFile } from 'vfile';

import type { DiagramStep } from '../Diagram.tsx';
import { flowchartAdapter } from './flowchart.ts';
import { kanbanAdapter, mindmapAdapter } from './outline.ts';
import { sequenceAdapter } from './sequence.ts';
import {
  isStatement,
  linesOf,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';
import { stateAdapter } from './state.ts';

/** Reports a problem with the steps of a diagram on a line of its source. */
export type StepReporter = (message: string, line: number) => void;

/** A step written in the source: its items, attributes, and line. */
interface Annotation {
  items: string[];
  attributes: string;
  line: number;
}

/** Matches a step in a comment, e.g., `%% step[C, B->C] only`. */
const STEP_COMMENT = /^%%\s*step(?:\[([^\]]*)\])?(?:\s+(.*))?$/;

/**
 * Returns the adapter for the type of `model`, given the lines of its source
 * after its `header`, if its items can be stepped.
 */
function adapterOf(
  model: DiagramModel,
  header: string,
  lines: readonly Line[],
): Adapter | undefined {
  if (model.type === 'flowchart') {
    return flowchartAdapter(model, header, lines);
  }
  if (model.type === 'state') {
    return stateAdapter(model, header, lines);
  }
  if (model.type === 'sequence') {
    return sequenceAdapter(model, header, lines);
  }
  if (model.type === 'mindmap') {
    return mindmapAdapter(model, lines);
  }
  if (model.type === 'kanban') {
    return kanbanAdapter(model, lines);
  }
  return undefined;
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
    // Keys and values may be quoted, e.g., in JSON.
    const unquote = (text: string) =>
      text.trim().replace(/^(["'])(.*)\1$/, '$2');
    const key = unquote(separator === -1 ? entry : entry.slice(0, separator));
    const value = separator === -1 ? '' : unquote(entry.slice(separator + 1));
    if (key !== '') {
      entries.push([key, value]);
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

/** Finds the steps in the shape data on `line`, e.g., `B@{ step }`. */
function shapeDataSteps(line: Line, adapter: Adapter): Annotation[] {
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
    const item =
      step === undefined
        ? undefined
        : adapter.shapeDataItem?.(
            line,
            line.text.slice(0, match.index),
            line.text.slice(data.end + 1),
          );
    if (step !== undefined && item !== undefined) {
      annotations.push({
        items: [item],
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
 * Finds the steps of the items of a diagram in its `source`, e.g., of the
 * nodes and edges of a flowchart, written in their shape data, e.g.,
 * `B[Parser]@{ step: "group=emit" }`, or in comments: `%% step …` before a
 * statement for what the statement is about, or `%% step[C, B->C] …` for the
 * items in the brackets. Their attributes are those of `:step`.
 *
 * Steps are nested in the steps of the items that their items are in, e.g.,
 * of subgraphs. Items without a step of their own are shown with the item
 * around them, and edges with the later of their ends, unless they have steps
 * of their own.
 */
export function findSteps(
  source: string,
  file: VFile,
  report: StepReporter,
): DiagramStep[] {
  const lines = linesOf(source);
  const comments = lines.filter((line) => STEP_COMMENT.test(line.text.trim()));
  const header = lines.find(isStatement);
  if (
    header === undefined ||
    (comments.length === 0 && !source.includes('@{'))
  ) {
    return [];
  }
  const body = lines.slice(lines.indexOf(header) + 1);
  let model: DiagramModel;
  try {
    model = parse(source);
  } catch {
    return [];
  }
  const adapter = adapterOf(model, header.text, body);
  if (adapter === undefined) {
    for (const line of comments) {
      report(
        `Steps of items aren't supported in diagrams of the type \`${model.type}\``,
        line.index,
      );
    }
    return [];
  }
  const { items } = adapter;
  const annotations: Annotation[] = [];
  body.forEach((line, position) => {
    const comment = STEP_COMMENT.exec(line.text.trim());
    if (comment === null) {
      if (isStatement(line)) {
        annotations.push(...shapeDataSteps(line, adapter));
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
    const next = body.slice(position + 1).find(isStatement);
    const about = next === undefined ? undefined : adapter.about(next);
    if (about === undefined || about.length === 0) {
      report(
        'Cannot tell what the step is about, list its items like `%% step[A, A->B]`',
        line.index,
      );
      return;
    }
    annotations.push({ items: about, attributes, line: line.index });
  });
  for (const { items: stepped, line } of annotations) {
    for (const item of stepped) {
      if (items.duplicates?.has(item) === true) {
        report(
          `Several items are called \`${item}\`, give them ids to step them`,
          line,
        );
      }
    }
  }
  return stepsOf(annotations, items, file, report);
}

/** Returns the items around `item`, from the nearest one. */
function ancestorsOf(item: string, items: Items): string[] {
  const ancestors: string[] = [];
  for (let at = items.parents.get(item); at !== undefined;) {
    ancestors.push(at);
    at = items.parents.get(at);
  }
  return ancestors;
}

/**
 * Returns the nearest item around `item`, e.g., its cluster, or for an edge
 * without one, the nearest item around both of its ends, e.g., the composite
 * state of a transition between its states.
 */
function containerOf(item: string, items: Items): string | undefined {
  const parent = items.parents.get(item);
  const ends = items.ends.get(item);
  if (parent !== undefined || ends === undefined) {
    return parent;
  }
  const around = [ends[1], ...ancestorsOf(ends[1], items)];
  return [ends[0], ...ancestorsOf(ends[0], items)].find((at) =>
    around.includes(at),
  );
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
        : (own.get(item) ??
            // Edges in an item, like messages in a block, come with it, too.
            Math.max(
              stepOf(ends[0]),
              stepOf(ends[1]),
              stepOf(items.parents.get(item)),
            )),
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
    // The step of the nearest item around the items that has another one.
    let parent = -1;
    for (
      let at = containerOf(stepped[0] ?? '', items);
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
