import {
  isAlwaysShown,
  moreHidden,
  SHOWN,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import type {
  StepNode,
  StepOptions,
  StepPath,
  StepPhase,
  StepPlacement,
} from './StepNode.ts';

/** Where a stepper is in the steps of its level. */
export interface StepProgress {
  /**
   * Zero-based index of the current step of the stepper, `-1` if the stepper
   * is not yet active, or `Infinity` if it is past.
   */
  stepIndex: number;
  phase: StepPhase;
}

/** What a `StepStore` knows about its steppers, which a layout is made from. */
export interface StepRegistry {
  nodes: ReadonlySet<StepNode>;
  groups: ReadonlyMap<string, StepNode>;
  /** The stepper of each element. */
  steppers: ReadonlyMap<Element, StepNode>;
  /** Elements in the steps of groups that they aren't inside of. */
  elementGroups: ReadonlyMap<Element, string>;
}

/** The element that determines the placement and appearances of a stepper. */
interface Anchor {
  element: Element;
  options: StepOptions;
}

/** A stepper with its place in the tree of steps. */
interface PlacedStep {
  anchor: Anchor;
  /** The stepper it's nested in, if any. */
  parent: StepNode | undefined;
  /**
   * What it stands in for, rather than being a step of its own: it has that
   * step's place and appearance, or those of its parent, if it has no step to
   * be shown with and doesn't create one.
   */
  aliases: StepNode | typeof PARENT | undefined;
  /** The step it's shown with, whether it stands in for it or not, if any. */
  shownWith: StepNode | undefined;
  /** Path of the step containing its level. */
  level: StepPath;
  /** Number of its first step on its level. */
  first: number;
  /** Number of its last step on its level. */
  last: number;
}

/** Stands for what encloses a level, which steppers can be part of, too. */
const PARENT: unique symbol = Symbol('parent');

/** A level of the tree of steps. */
interface Level {
  /** Number of its last step, which is 0 for levels with only step 0. */
  size: number;
  /** What its latest stepper is, or is part of. */
  previous?: StepNode | typeof PARENT;
  /** Likewise, without the steppers that are overlays. */
  content?: StepNode | typeof PARENT;
  /** Its latest step at step 0. */
  initial?: StepNode;
}

const FUTURE: StepProgress = { stepIndex: -1, phase: 'future' };

const PAST: StepProgress = {
  stepIndex: Number.POSITIVE_INFINITY,
  phase: 'past',
};

const DISTANT_FUTURE: StepProgress = { stepIndex: -1, phase: 'distantFuture' };

const DISTANT_PAST: StepProgress = {
  stepIndex: Number.POSITIVE_INFINITY,
  phase: 'distantPast',
};

/** The place of steppers that are part of the slide itself, not of any step. */
const SLIDE: StepProgress = { stepIndex: 0, phase: 'current' };

function levelKey(level: StepPath): string {
  return level.join('.');
}

export function compareDocumentOrder(a: Element, b: Element): number {
  if (a === b) {
    return 0;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

/** Whether an element of `node` is an overlay. */
export function isOverlay(node: StepNode): boolean {
  return [...node.elements.values()].some(({ overlay }) => overlay === true);
}

/**
 * Returns the element that determines the placement and appearances of `node`:
 * its first one in document order. Thus, a group is nested wherever it's first
 * found, along with its other elements.
 */
function findAnchor(node: StepNode): Anchor | undefined {
  let anchor: Anchor | undefined;
  for (const [element, options] of node.elements) {
    if (
      anchor === undefined ||
      compareDocumentOrder(element, anchor.element) < 0
    ) {
      anchor = { element, options };
    }
  }
  return anchor;
}

/** Returns the anchors of the steppers that have steps, in document order. */
function findAnchors({ nodes }: StepRegistry): Map<StepNode, Anchor> {
  const anchors = [...nodes].flatMap((node): [StepNode, Anchor][] => {
    const anchor = findAnchor(node);
    return anchor !== undefined && anchor.options.count >= 1
      ? [[node, anchor]]
      : [];
  });
  return new Map(
    anchors.sort(([, x], [, y]) => compareDocumentOrder(x.element, y.element)),
  );
}

/** Returns the stepper of the group `name` if it is placed, except `node`. */
function findGroup(
  { groups }: StepRegistry,
  anchors: ReadonlyMap<StepNode, Anchor>,
  name: string | undefined,
  node: StepNode,
): StepNode | undefined {
  const group = name === undefined ? undefined : groups.get(name);
  return group !== undefined && group !== node && anchors.has(group)
    ? group
    : undefined;
}

/**
 * Finds the closest stepper enclosing `element` of `node`, or that `element` is
 * an element of, if `inclusive`, including the steppers of the groups that
 * elements are added to (see `StepStore.addToGroup`).
 */
function findEnclosingElement(
  registry: StepRegistry,
  anchors: ReadonlyMap<StepNode, Anchor>,
  node: StepNode,
  element: Element,
  inclusive = false,
): StepNode | undefined {
  for (
    let ancestor = inclusive ? element : element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    const group = findGroup(
      registry,
      anchors,
      registry.elementGroups.get(ancestor),
      node,
    );
    if (group !== undefined) {
      return group;
    }
    const owner = registry.steppers.get(ancestor);
    if (owner !== undefined && owner !== node && anchors.has(owner)) {
      return owner;
    }
  }
  return undefined;
}

/** Returns the stepper each stepper is placed right after, if any. */
function findPredecessors(
  registry: StepRegistry,
  anchors: ReadonlyMap<StepNode, Anchor>,
): Map<StepNode, StepNode> {
  const predecessors = new Map<StepNode, StepNode>();
  for (const [node, { options }] of anchors) {
    const predecessor = findGroup(registry, anchors, options.after, node);
    if (predecessor !== undefined) {
      predecessors.set(node, predecessor);
    }
  }
  // Steppers may be placed after each other in a cycle, which we break at the
  // first one in document order, which is placed by its elements.
  for (const node of anchors.keys()) {
    const chain = new Set<StepNode>();
    let current: StepNode | undefined = node;
    while (current !== undefined && !chain.has(current)) {
      chain.add(current);
      current = predecessors.get(current);
    }
    if (current === node) {
      predecessors.delete(node);
    }
  }
  return predecessors;
}

/**
 * Orders steppers, given in document order, keeping that order, except that
 * steppers placed after another one come right after it, before the steppers
 * that follow it in document order, and in document order among each other.
 *
 * @param predecessors The stepper each stepper is placed after, if any, which
 *   mustn't form cycles.
 */
function orderSteppers(
  nodes: Iterable<StepNode>,
  predecessors: ReadonlyMap<StepNode, StepNode>,
): StepNode[] {
  const inOrder = [...nodes];
  const successors = new Map<StepNode, StepNode[]>();
  for (const node of inOrder) {
    const predecessor = predecessors.get(node);
    if (predecessor !== undefined) {
      successors.set(predecessor, [
        ...(successors.get(predecessor) ?? []),
        node,
      ]);
    }
  }
  const order: StepNode[] = [];
  const visit = (node: StepNode) => {
    order.push(node);
    for (const successor of successors.get(node) ?? []) {
      visit(successor);
    }
  };
  for (const node of inOrder) {
    if (!predecessors.has(node)) {
      visit(node);
    }
  }
  return order;
}

/** Returns the stepper that encloses each stepper, if any. */
function findEnclosing(
  registry: StepRegistry,
  anchors: ReadonlyMap<StepNode, Anchor>,
  predecessors: ReadonlyMap<StepNode, StepNode>,
): Map<StepNode, StepNode | undefined> {
  const enclosing = new Map<StepNode, StepNode | undefined>();
  const find = (node: StepNode): StepNode | undefined => {
    if (enclosing.has(node)) {
      return enclosing.get(node);
    }
    const anchor = anchors.get(node);
    if (anchor === undefined) {
      return undefined;
    }
    const predecessor = predecessors.get(node);
    const parentOption =
      anchor.options.parent ??
      (node.elements.size === 1 ? anchor.options.defaults?.in : undefined);
    const parent =
      predecessor === undefined
        ? typeof parentOption === 'object'
          ? findEnclosingElement(registry, anchors, node, parentOption, true)
          : (findGroup(registry, anchors, parentOption, node) ??
            findEnclosingElement(registry, anchors, node, anchor.element))
        : find(predecessor);
    // A stepper placed after one nested in it ends up in itself.
    const result = parent === node ? undefined : parent;
    enclosing.set(node, result);
    return result;
  };
  for (const node of anchors.keys()) {
    find(node);
  }
  return enclosing;
}

/** Returns what `placement` refers to on `level`, if anything. */
function targetOf(
  level: Level | undefined,
  placement: StepPlacement,
): StepNode | typeof PARENT | undefined {
  switch (placement) {
    case 'previous':
      return level?.previous;
    case 'content':
      return level?.content;
    case 'initial':
      return level?.initial;
    case 'parent':
      return PARENT;
    case 'next':
      return undefined;
  }
}

/** Places the steppers on the levels of the tree of steps. */
function placeSteppers(
  anchors: ReadonlyMap<StepNode, Anchor>,
  ordered: readonly StepNode[],
  enclosing: ReadonlyMap<StepNode, StepNode | undefined>,
): {
  steps: Map<StepNode, PlacedStep>;
  levels: Map<string, Level>;
} {
  const nested = new Map<StepNode | undefined, StepNode[]>();
  for (const node of ordered) {
    const parent = enclosing.get(node);
    nested.set(parent, [...(nested.get(parent) ?? []), node]);
  }
  const steps = new Map<StepNode, PlacedStep>();
  const levels = new Map<string, Level>();
  // Enclosing steppers are placed before the steppers nested in them, since
  // joining steppers decide which level the steppers inside them are on.
  const place = (node: StepNode) => {
    const anchor = anchors.get(node);
    if (anchor === undefined || steps.has(node)) {
      return;
    }
    const { options } = anchor;
    const single = node.elements.size === 1;
    const defaults = single ? options.defaults : undefined;
    const placement = defaults?.joins ?? defaults?.with ?? options.placement;
    const around = enclosing.get(node);
    const aroundStep = around === undefined ? undefined : steps.get(around);
    const parent =
      aroundStep?.aliases === undefined
        ? around
        : aroundStep.aliases === PARENT
          ? aroundStep.parent
          : aroundStep.aliases;
    const parentStep = parent === undefined ? undefined : steps.get(parent);
    const path =
      parentStep === undefined ? [] : [...parentStep.level, parentStep.last];
    const key = levelKey(path);
    const level = levels.get(key) ?? { size: 0 };
    levels.set(key, level);
    const target = targetOf(level, placement);
    // Several steps can't be one, and appearances of its own make it a step.
    const canAlias =
      single && options.count === 1 && options.appearances === undefined;
    const aliases =
      placement === 'parent'
        ? PARENT
        : canAlias
          ? (target ?? (defaults?.joins === undefined ? undefined : PARENT))
          : undefined;
    const shownWith = target === PARENT ? undefined : target;
    let first: number;
    if (placement === 'next') {
      first = level.size + 1;
    } else if (placement === 'initial' || placement === 'parent') {
      first = 0;
    } else {
      first = shownWith === undefined ? 0 : (steps.get(shownWith)?.last ?? 0);
    }
    const last = aliases === undefined ? first + options.count - 1 : first;
    steps.set(node, {
      anchor,
      parent,
      aliases,
      shownWith,
      level: path,
      first,
      last,
    });
    level.size = Math.max(level.size, last);
    if (aliases === undefined && first === 0) {
      level.initial = node;
    }
    // Without anything to be shown with, later steppers can't be shown with it.
    const latest = aliases === undefined ? node : target;
    if (latest !== undefined) {
      level.previous = latest;
      if (!isOverlay(latest === PARENT ? node : latest)) {
        level.content = latest;
      }
    }
    for (const child of nested.get(node) ?? []) {
      place(child);
    }
  };
  for (const node of nested.get(undefined) ?? []) {
    place(node);
  }
  // Groups may nest in each other in a cycle, which we break by treating the
  // first stepper in it as top-level.
  for (const node of ordered) {
    place(node);
  }
  return { steps, levels };
}

/**
 * The steppers of a slide placed in the tree of steps, and what follows from
 * that alone: where a path is relative to each stepper, and how each one appears
 * there. A layout doesn't change, so a new one is made whenever the steppers do.
 */
export class StepLayout {
  readonly #registry: StepRegistry;
  readonly #steps: ReadonlyMap<StepNode, PlacedStep>;
  readonly #levels: ReadonlyMap<string, Level>;
  readonly #appearances = new Map<StepNode, RankedAppearances | undefined>();
  #positions: readonly StepPath[] | undefined;
  /** The steppers that have a place, in the document order of their anchors. */
  readonly steppers: readonly StepNode[];

  constructor(registry: StepRegistry) {
    this.#registry = registry;
    const anchors = findAnchors(registry);
    const predecessors = findPredecessors(registry, anchors);
    const { steps, levels } = placeSteppers(
      anchors,
      orderSteppers(anchors.keys(), predecessors),
      findEnclosing(registry, anchors, predecessors),
    );
    this.#steps = steps;
    this.#levels = levels;
    this.steppers = [...anchors.keys()];
  }

  /** The anchor and the place of `node` in the tree, if it has one. */
  stepOf(node: StepNode): Readonly<PlacedStep> | undefined {
    return this.#steps.get(node);
  }

  /** The stepper that `element` is an element of, if any. */
  stepperOf(element: Element): StepNode | undefined {
    return this.#registry.steppers.get(element);
  }

  /** Number of the last step on `level`, or `undefined` if it's empty. */
  sizeOf(level: StepPath): number | undefined {
    return this.#levels.get(levelKey(level))?.size;
  }

  /** Returns the steppers on `level`, in the document order of their anchors. */
  steppersOn(level: StepPath): (readonly [StepNode, Readonly<PlacedStep>])[] {
    const key = levelKey(level);
    return this.steppers.flatMap((node) => {
      const step = this.#steps.get(node);
      return step !== undefined && levelKey(step.level) === key
        ? [[node, step] as const]
        : [];
    });
  }

  /** Whether `node` stands in for its parent, rather than for a step. */
  aliasesParent(node: StepNode): boolean {
    return this.#steps.get(node)?.aliases === PARENT;
  }

  /**
   * Returns the stepper that created the moment `node` is shown at, or
   * `undefined` for what's only part of the slide itself.
   */
  momentOf(
    node: StepNode,
    visited: Set<StepNode> = new Set<StepNode>(),
  ): StepNode | undefined {
    const step = this.#steps.get(node);
    if (step === undefined || visited.has(node)) {
      return undefined;
    }
    visited.add(node);
    if (step.shownWith !== undefined) {
      return this.momentOf(step.shownWith, visited);
    }
    if (step.aliases !== PARENT) {
      return node;
    }
    return step.parent === undefined
      ? undefined
      : this.momentOf(step.parent, visited);
  }

  /** The step that `node` stands in for, if any. */
  aliasedStep(node: StepNode): StepNode | undefined {
    const aliases = this.#steps.get(node)?.aliases;
    return aliases === PARENT ? undefined : aliases;
  }

  /**
   * Returns the names of the groups that have a place, in the document order
   * of their anchors.
   */
  groupNames(): string[] {
    return [...this.#registry.groups]
      .flatMap(([name, node]) => {
        const anchor = this.#steps.get(node)?.anchor;
        return anchor === undefined ? [] : [{ name, anchor }];
      })
      .sort((a, b) => compareDocumentOrder(a.anchor.element, b.anchor.element))
      .map(({ name }) => name);
  }

  /**
   * Returns the path of the first step of the group `name`, or `undefined` if
   * the slide has no such group.
   */
  groupPath(name: string): StepPath | undefined {
    const node = this.#registry.groups.get(name);
    const step = node === undefined ? undefined : this.#steps.get(node);
    return step === undefined ? undefined : [...step.level, step.first];
  }

  /** Finds the step after `from`. */
  nextOf(from: StepPath): StepPath | undefined {
    // Levels nested in step 0 are shown along with their enclosing level, so
    // we have to look for the next step in them first.
    const path = [...from];
    while (this.sizeOf([...path, 0]) !== undefined) {
      path.push(0);
    }
    for (let depth = path.length; depth >= 0; depth -= 1) {
      const level = path.slice(0, depth);
      const position = path[depth] ?? 0;
      if (position < (this.sizeOf(level) ?? 0)) {
        return [...level, position + 1];
      }
    }
    return undefined;
  }

  /** Returns the paths of the steps of the slide in order, starting with []. */
  positions(): readonly StepPath[] {
    if (this.#positions === undefined) {
      const positions: StepPath[] = [[]];
      for (
        let position = this.nextOf([]);
        position !== undefined;
        position = this.nextOf(position)
      ) {
        positions.push(position);
      }
      this.#positions = positions;
    }
    return this.#positions;
  }

  /**
   * Returns where `path` is relative to `node`, which is what encloses it if
   * it isn't a step, or the slide itself.
   */
  progressOf(node: StepNode, path: StepPath): StepProgress {
    const step = this.#steps.get(node);
    if (step === undefined) {
      return FUTURE;
    }
    if (step.aliases === PARENT) {
      return step.parent === undefined
        ? SLIDE
        : this.progressOf(step.parent, path);
    }
    const { level, first, last } = step;
    for (const [depth, levelStep] of level.entries()) {
      const position = path[depth] ?? 0;
      if (position !== levelStep) {
        // The enclosing step is either already done or not yet shown.
        return position > levelStep ? DISTANT_PAST : DISTANT_FUTURE;
      }
    }
    const position = path[level.length] ?? 0;
    if (position < first) {
      return FUTURE;
    }
    if (position > last) {
      return PAST;
    }
    // Step 0 of the nested level is shown along with the stepper.
    const nested = path.slice(level.length + 1).some((part) => part > 0);
    return {
      stepIndex: position - first,
      phase: nested ? 'open' : 'current',
    };
  }

  /**
   * Returns how `node` appears as a whole in each phase, which elements without
   * appearances of their own take on: like its first element in document order
   * that has any, apart from elements that are always shown, like `Steps`, if
   * there are others.
   */
  appearancesOf(node: StepNode): RankedAppearances | undefined {
    if (!this.#appearances.has(node)) {
      const candidates = [...node.elements]
        .sort(([x], [y]) => compareDocumentOrder(x, y))
        .flatMap(
          ([, { appearances, defaultAppearances }]) =>
            appearances ?? defaultAppearances ?? [],
        );
      this.#appearances.set(
        node,
        candidates.find((candidate) => !isAlwaysShown(candidate)) ??
          candidates[0],
      );
    }
    return this.#appearances.get(node);
  }

  /**
   * Returns how `node` appears at `path`, at least as hidden as the steppers it
   * is nested in, whether in the DOM or explicitly, or like the step it is part
   * of.
   */
  appearanceAt(node: StepNode, path: StepPath): RankedAppearance {
    return this.#appearanceAt(node, path, new Set());
  }

  /** Returns how the stepper that `node` is nested in appears at `path`. */
  inheritedAt(node: StepNode, path: StepPath): RankedAppearance {
    const parent = this.#steps.get(node)?.parent;
    return parent === undefined
      ? SHOWN
      : this.#appearanceAt(parent, path, new Set([node]));
  }

  #appearanceAt(
    node: StepNode,
    path: StepPath,
    visited: Set<StepNode>,
  ): RankedAppearance {
    if (visited.has(node)) {
      // Groups may nest in each other in a cycle.
      return SHOWN;
    }
    visited.add(node);
    const owner = this.#appearanceOwner(node);
    if (owner !== undefined) {
      return this.#appearanceAt(owner, path, visited);
    }
    const { phase } = this.progressOf(node, path);
    // Without a step to be part of, it appears like what encloses it.
    const own = this.aliasesParent(node)
      ? SHOWN
      : (this.appearancesOf(node)?.[phase] ?? SHOWN);
    const parent = this.#steps.get(node)?.parent;
    return parent === undefined
      ? own
      : moreHidden(own, this.#appearanceAt(parent, path, visited));
  }

  /**
   * Returns the step whose appearance `node` takes on, if it's part of a step
   * that has one. Steps whose content changes instead, like `Steps`, have none.
   */
  #appearanceOwner(node: StepNode): StepNode | undefined {
    const owner = this.aliasedStep(node);
    const appearances =
      owner === undefined ? undefined : this.appearancesOf(owner);
    return appearances === undefined || isAlwaysShown(appearances)
      ? undefined
      : owner;
  }
}
