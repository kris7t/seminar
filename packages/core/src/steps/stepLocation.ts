import type { StepLayout } from './StepLayout.ts';
import type { StepPath } from './StepNode.ts';
import type { StepTarget } from './StepPosition.ts';
import { compareStepPaths } from './stepRange.ts';
import { stepTextsOf } from './stepTree.ts';

function trimPath(path: number[]): number[] {
  while (path.at(-1) === 0) {
    path.pop();
  }
  return path;
}

export function pathsEqual(a: StepPath, b: StepPath): boolean {
  return a.length === b.length && a.every((step, i) => step === b[i]);
}

/**
 * How much the texts of two steps overlap, from 0 for none to 1 for the same
 * texts, counting repeated texts as often as they appear in both.
 */
function overlapOf(a: readonly string[], b: readonly string[]): number {
  if (a.length + b.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const text of a) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  let common = 0;
  for (const text of b) {
    const count = counts.get(text) ?? 0;
    if (count > 0) {
      counts.set(text, count - 1);
      common += 1;
    }
  }
  return (2 * common) / (a.length + b.length);
}

/**
 * Finds the step that shows the most of `texts`, preferring `path`, and then the
 * steps closest to it. Returns `path` if no step shows any of them.
 */
function findByTexts(
  layout: StepLayout,
  path: StepPath,
  texts: readonly string[],
): StepPath {
  const own = stepTextsOf(layout, path);
  if (own !== undefined && overlapOf(own, texts) === 1) {
    return path;
  }
  const positions = layout.positions();
  const index = positions.findIndex(
    (position) => compareStepPaths(position, path) >= 0,
  );
  const origin = index === -1 ? positions.length : index;
  let best = path;
  let bestOverlap = own === undefined ? 0 : overlapOf(own, texts);
  let bestDistance = 0;
  for (const [position, candidate] of positions.entries()) {
    const candidateTexts = stepTextsOf(layout, candidate);
    if (candidateTexts === undefined) {
      continue;
    }
    const overlap = overlapOf(candidateTexts, texts);
    const distance = Math.abs(position - origin);
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && overlap > 0 && distance < bestDistance)
    ) {
      best = candidate;
      bestOverlap = overlap;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Describes `path` relative to the first step of a step group, if it is that
 * step or nested in it, so that it can be referred to by the name of the group.
 * If there are several such groups, the most nested one is used, or the first
 * one in document order among those.
 *
 * @returns The name of the group, if any, and the rest of the path.
 */
export function describeStepPath(
  layout: StepLayout,
  path: StepPath,
): { group?: string; path: StepPath } {
  let best: { group?: string; path: StepPath } = { path };
  let bestLength = 0;
  for (const name of layout.groupNames()) {
    const groupPath = layout.groupPath(name) ?? [];
    if (
      groupPath.length > bestLength &&
      groupPath.length <= path.length &&
      groupPath.every((step, depth) => step === path[depth])
    ) {
      best = { group: name, path: path.slice(groupPath.length) };
      bestLength = groupPath.length;
    }
  }
  return best;
}

/**
 * Returns the target of the step at `path`, which refers to it by its group if
 * possible, so that it stays shown when steps are added before it, e.g., when
 * the slide is edited.
 */
export function stepTargetOf(
  layout: StepLayout,
  path: StepPath,
  toEnd: boolean,
  inRange: boolean,
): StepTarget {
  const { group, path: relative } = describeStepPath(layout, path);
  const texts = stepTextsOf(layout, path);
  return group === undefined
    ? { path, texts, toEnd, inRange }
    : { path: relative, group, fallback: path, texts, toEnd, inRange };
}

/**
 * Returns `target` along with where the step shown for it is, at `path`, and its
 * texts, if it doesn't say yet, e.g., if it comes from a link, so that the step
 * stays shown if steps are added before it, or its group is renamed or removed.
 *
 * @returns `undefined` if there's nothing to add.
 */
export function rememberStepTarget(
  layout: StepLayout,
  target: StepTarget,
  path: StepPath,
): StepTarget | undefined {
  if (target.toEnd || target.texts !== undefined) {
    return undefined;
  }
  if (target.group === undefined) {
    const texts = pathsEqual(path, trimPath([...target.path]))
      ? stepTextsOf(layout, path)
      : undefined;
    return texts === undefined ? undefined : { ...target, texts };
  }
  return target.fallback === undefined &&
    layout.groupPath(target.group) !== undefined
    ? { ...target, fallback: path, texts: stepTextsOf(layout, path) }
    : undefined;
}

/**
 * Returns the step that `target` refers to, regardless of the range of the
 * slide, dropping any steps that don't exist.
 */
export function resolveStepTarget(
  layout: StepLayout,
  { path: relative, group, fallback = [], texts, toEnd }: StepTarget,
): StepPath {
  const groupPath = group === undefined ? [] : layout.groupPath(group);
  let target = groupPath === undefined ? fallback : [...groupPath, ...relative];
  // Steps without their group are found by their texts instead.
  if (texts !== undefined && (group === undefined || groupPath === undefined)) {
    target = findByTexts(layout, target, texts);
  }
  const path: number[] = [];
  for (const position of target) {
    const size = layout.sizeOf(path) ?? 0;
    if (!Number.isInteger(position) || position < 0 || position > size) {
      break;
    }
    path.push(position);
  }
  if (toEnd) {
    // Go to the last step of each nested level, including the levels nested in
    // step 0 if there are no other steps.
    for (;;) {
      const size = layout.sizeOf(path);
      if (size === undefined) {
        break;
      }
      path.push(size);
    }
  }
  return trimPath(path);
}
