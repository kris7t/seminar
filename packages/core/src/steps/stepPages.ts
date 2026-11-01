import { moreHidden, type RankedAppearances } from './stepAppearance.ts';
import { isOverlay, type StepLayout, type StepProgress } from './StepLayout.ts';
import type { StepNode, StepPath } from './StepNode.ts';
import { compareStepPaths } from './stepRange.ts';
import { planSplit, type SlideSplit, type SplitMode } from './stepSplit.ts';

/** What choosing the pages of a slide depends on. */
interface PageContext {
  layout: StepLayout;
  /** The steps in the range of the slide, in order. */
  states: readonly StepPath[];
  slideSplit: SlideSplit | undefined;
  /** The rank of the most hidden appearance that pages still show content in. */
  legibleRank: number;
}

/**
 * Returns the split mode of `node`: `'each'` if an element asks for it, `'none'`
 * if all of them do, or else `'auto'`, where elements without a mode take that
 * of the stepper `node` is nested in, or of the slide.
 */
function splitModeOf(
  context: PageContext,
  node: StepNode,
  visited: Set<StepNode>,
): SplitMode {
  const step = context.layout.stepOf(node);
  const parent = step?.owner ?? step?.parent;
  let inherited: SplitMode | undefined;
  const getInherited = () => {
    inherited ??=
      parent === undefined || visited.has(parent)
        ? (context.slideSplit?.mode ?? 'auto')
        : splitModeOf(context, parent, visited.add(node));
    return inherited;
  };
  const modes = [...node.elements.values()].map(
    ({ split }) => split?.mode ?? getInherited(),
  );
  if (modes.includes('each')) {
    return 'each';
  }
  return modes.every((mode) => mode === 'none') ? 'none' : 'auto';
}

/** Whether pages show `node` at `path`, in `look` if given. */
function isLegible(
  { layout, legibleRank }: PageContext,
  node: StepNode,
  path: StepPath,
  look?: RankedAppearances,
): boolean {
  const appearance =
    look === undefined
      ? layout.lookOf(node, path)
      : moreHidden(
          look[layout.progressOf(node, path).phase],
          layout.inheritedOf(node, path),
        );
  return appearance.rank <= legibleRank;
}

/** Returns the indices of the states in which pages show `node`. */
function legibleStates(
  context: PageContext,
  node: StepNode,
  when: (progress: StepProgress) => boolean,
  look?: RankedAppearances,
): ReadonlySet<number> {
  return new Set(
    context.states.flatMap((path, index) =>
      when(context.layout.progressOf(node, path)) &&
      isLegible(context, node, path, look)
        ? [index]
        : [],
    ),
  );
}

/**
 * Returns the looks of `node` that need a page, where `undefined` stands for
 * how it looks as a whole. Elements with a look of their own need a page in that
 * look, too.
 */
function looksOf(
  layout: StepLayout,
  node: StepNode,
): (RankedAppearances | undefined)[] {
  const whole = layout.appearancesOf(node);
  const own = new Set<RankedAppearances>();
  for (const { appearances, ownLook } of node.elements.values()) {
    if (
      ownLook === true &&
      appearances !== undefined &&
      appearances !== whole
    ) {
      own.add(appearances);
    }
  }
  return [undefined, ...own];
}

/**
 * Content is read without overlays before they cover it, unless it's shown along
 * with them, which then likely don't cover it.
 *
 * @param covered The indices of the states with an overlay.
 * @param unit The indices of the states that show the content.
 * @returns The indices of the states to read the content in.
 */
function uncoveredOf(
  covered: ReadonlySet<number>,
  unit: ReadonlySet<number>,
): ReadonlySet<number> {
  const shown = [...unit].sort((a, b) => a - b);
  const firstCovered = shown.find((index) => covered.has(index));
  const before = shown.filter(
    (index) => firstCovered === undefined || index < firstCovered,
  );
  return before.length > 0 ? new Set(before) : unit;
}

/** Returns the sets of states of which each needs a page for `node`. */
function unitsOf(
  context: PageContext,
  node: StepNode,
  covered: ReadonlySet<number>,
): ReadonlySet<number>[] {
  const { layout } = context;
  const mode = splitModeOf(context, node, new Set());
  if (mode === 'none') {
    return [];
  }
  const count = layout.stepOf(node)?.anchor.options.count ?? 1;
  const units = looksOf(layout, node).flatMap((look) =>
    mode === 'each'
      ? // Content shown before the stepper, e.g., by `Steps`, too.
        Array.from({ length: count + 1 }, (_, index) =>
          legibleStates(
            context,
            node,
            ({ stepIndex }) => Math.min(stepIndex, count - 1) === index - 1,
            look,
          ),
        )
      : [legibleStates(context, node, () => true, look)],
  );
  return isOverlay(node)
    ? units
    : units.map((unit) => uncoveredOf(covered, unit));
}

/** Returns the indices of the states that `node` asks to be pages. */
function pointsOf({ layout, states }: PageContext, node: StepNode): number[] {
  const turn = states.flatMap((path, index) => {
    const { phase } = layout.progressOf(node, path);
    return phase === 'current' || phase === 'open' ? [index] : [];
  });
  const first = turn[0];
  const last = turn.at(-1);
  if (first === undefined || last === undefined) {
    return [];
  }
  const points = new Set(
    [...node.elements.values()].flatMap(({ split }) => [
      ...(split?.points ?? []),
    ]),
  );
  return [
    ...(points.has('before') && first > 0 ? [first - 1] : []),
    ...(points.has('initial') ? [first] : []),
    ...(points.has('last') ? [last] : []),
  ];
}

/** Returns the indices of the states that the slide asks to be pages. */
function slidePagesOf({ layout, states, slideSplit }: PageContext): number[] {
  return (slideSplit?.pages ?? []).flatMap(({ group, path }) => {
    const groupPath = group === undefined ? [] : layout.groupPath(group);
    if (groupPath === undefined) {
      return [];
    }
    const target = [...groupPath, ...path];
    const index = states.findIndex(
      (state) => compareStepPaths(state, target) === 0,
    );
    return index >= 0 ? [index] : [];
  });
}

/**
 * Returns the steps to make pages of when a slide is split into pages, in order
 * (see `StepStore.getSplitPaths`).
 */
export function computeStepPages(context: PageContext): readonly StepPath[] {
  const { layout, states } = context;
  // What isn't a step is part of what encloses it, which isn't an overlay.
  const overlays = layout.steppers.filter(
    (node) => isOverlay(node) && !layout.isStepless(node),
  );
  const covered = new Set(
    states.flatMap((path, index) =>
      overlays.some((node) => isLegible(context, node, path)) ? [index] : [],
    ),
  );
  // Content outside of steps is shown in every state.
  const units = [
    uncoveredOf(covered, new Set(states.keys())),
    ...layout.steppers.flatMap((node) => unitsOf(context, node, covered)),
  ];
  const forced = [
    ...layout.steppers.flatMap((node) => pointsOf(context, node)),
    ...slidePagesOf(context),
  ];
  return planSplit(states.length, units, forced).map(
    (index) => states[index] ?? [],
  );
}
