import { createStepPosition, type StepPosition } from './StepPosition.ts';
import {
  moreHidden,
  SHOWN,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';

/**
 * Position of a slide in its steps.
 *
 * Each entry is the number of the current step at a level of the step
 * hierarchy. The first entry refers to the top-level steps of the slide, and
 * each further entry refers to the steps nested inside the current step of the
 * previous level. Steps are numbered from 1, while step 0 of a level consists
 * of the content shown as soon as the level is shown (see `with="initial"`).
 * Missing trailing entries are 0, so the empty path is the state before any
 * step is shown.
 */
export type StepPath = readonly number[];

/**
 * Where the presentation is relative to a stepper:
 *
 * - `'future'`: the stepper isn't shown yet.
 * - `'current'`: the current step of the slide is one of the steps of the
 *   stepper.
 * - `'parent'`: like `'current'`, but a step nested inside the stepper has
 *   been shown since, which is the current step of the slide or encloses it.
 * - `'past'`: a later step on the same level, or on an enclosing level, has
 *   been shown.
 */
export type StepPhase = 'future' | 'current' | 'parent' | 'past';

/** Where a stepper is in the steps of its level. */
interface StepPlace {
  /**
   * Zero-based index of the current step of the stepper, `-1` if the stepper
   * is not yet active, or `Infinity` if it is past.
   */
  stepIndex: number;
  phase: StepPhase;
}

/** State of a stepper as stored in a {@link StepStore}. */
export interface StepStatus extends StepPlace {
  /**
   * Whether the level of the stepper is open, i.e., the stepper it is nested
   * in is current or a parent, or it isn't nested in any.
   */
  isOpen: boolean;
  /**
   * How the stepper it is nested in looks, including the steppers that one is
   * nested in, which the stepper should look at least as hidden as.
   */
  inherited: RankedAppearance;
}

/**
 * Where the first step of a stepper is placed on its level:
 *
 * - `'next'`: after the previous step.
 * - `'previous'`: together with the previous stepper on the same level (in
 *   document order), or like `'initial'` if there is none.
 * - `'initial'`: at step 0, i.e., shown as soon as the level is shown.
 */
export type StepPlacement = 'next' | 'previous' | 'initial';

export interface StepOptions {
  /** Number of consecutive steps taken by the stepper. */
  count: number;
  placement: StepPlacement;
  /**
   * Group of the stepper to nest the stepper in, instead of the stepper
   * enclosing its elements.
   */
  parent?: string | undefined;
  /**
   * Group of the stepper to place the stepper right after, on the level of
   * that stepper, i.e., nested in the same stepper. Takes precedence over
   * `parent` and the steppers enclosing the elements of the stepper.
   */
  after?: string | undefined;
  /** Title of the stepper in the tree of steps, instead of its text. */
  title?: string | undefined;
  /** How the stepper looks in each phase. Shown in all phases by default. */
  appearances?: RankedAppearances | undefined;
}

/** A stepper registered in a {@link StepStore}. */
export class StepNode {
  /**
   * The elements of the stepper with their options. The options of the first
   * element in document order apply to the stepper.
   */
  readonly elements: Map<Element, StepOptions> = new Map<
    Element,
    StepOptions
  >();
}

/** A step of a slide in the tree of its steps, see {@link StepStore.getTree}. */
export interface StepTreeEntry {
  /** The path that shows the step as the current one. */
  path: StepPath;
  /**
   * The title of the step, or the text shown by it, without the text of the
   * steps nested in it, or the empty string if it shows no text.
   */
  label: string;
  /** The steps nested in the step. */
  children: readonly StepTreeEntry[];
}

interface Placement {
  /** Path of the step containing the level of this stepper. */
  level: StepPath;
  /** Number of the first step of this stepper on its level. */
  first: number;
  /** Number of the last step of this stepper on its level. */
  last: number;
}

/** The element that determines the placement of a stepper. */
interface Anchor {
  element: Element;
  options: StepOptions;
}

interface Layout {
  anchors: Map<StepNode, Anchor>;
  /** The stepper each stepper is nested in, if any. */
  parents: Map<StepNode, StepNode | undefined>;
  placements: Map<StepNode, Placement>;
  /**
   * Number of the last step on each level, keyed by {@link levelKey}.
   * Levels with only step 0 have size 0.
   */
  levelSizes: Map<string, number>;
}

const FUTURE: StepPlace = { stepIndex: -1, phase: 'future' };

const PAST: StepPlace = {
  stepIndex: Number.POSITIVE_INFINITY,
  phase: 'past',
};

function levelKey(level: StepPath): string {
  return level.join('.');
}

function compareDocumentOrder(a: Element, b: Element): number {
  if (a === b) {
    return 0;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

function trimPath(path: number[]): number[] {
  while (path.at(-1) === 0) {
    path.pop();
  }
  return path;
}

/** Elements whose text isn't shown, or not as text. */
const TEXTLESS_SELECTOR =
  'annotation, script, style, template, [aria-hidden="true"]';

/**
 * Returns the text in `element`, collapsing whitespace, and leaving out the
 * elements for which `skip` returns `true`, along with their contents.
 */
function textOf(element: Element, skip: (element: Element) => boolean): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node instanceof Element) {
      if (node.matches(TEXTLESS_SELECTOR) || skip(node)) {
        return;
      }
      for (const child of node.childNodes) {
        visit(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
    }
  };
  for (const child of element.childNodes) {
    visit(child);
  }
  return parts.join('').replaceAll(/\s+/g, ' ').trim();
}

/**
 * Orders steppers, given in document order, keeping that order, except that
 * steppers placed after another one come right after it, before the steppers
 * that follow it in document order, and in document order among each other.
 *
 * @param predecessors The stepper each stepper is placed after, if any, which
 *   mustn't form cycles.
 * @returns The position of each stepper in the order.
 */
function orderSteppers(
  sorted: readonly (readonly [StepNode, Anchor])[],
  predecessors: Map<StepNode, StepNode>,
): Map<StepNode, number> {
  const successors = new Map<StepNode, StepNode[]>();
  for (const [node] of sorted) {
    const predecessor = predecessors.get(node);
    if (predecessor !== undefined) {
      successors.set(predecessor, [
        ...(successors.get(predecessor) ?? []),
        node,
      ]);
    }
  }
  const order = new Map<StepNode, number>();
  const visit = (node: StepNode) => {
    order.set(node, order.size);
    for (const successor of successors.get(node) ?? []) {
      visit(successor);
    }
  };
  for (const [node] of sorted) {
    if (!predecessors.has(node)) {
      visit(node);
    }
  }
  return order;
}

function pathsEqual(a: StepPath, b: StepPath): boolean {
  return a.length === b.length && a.every((step, i) => step === b[i]);
}

/**
 * Keeps track of the steppers of a slide in a view, and resolves the position
 * in the steps of the slide, which may be shared with other views, against
 * them.
 *
 * Steppers are ordered by the position of their elements in the document.
 * The level of a stepper is determined by the closest enclosing element of
 * another stepper: steppers inside the elements of a step are nested inside
 * that step.
 */
export class StepStore {
  readonly #nodes = new Set<StepNode>();
  readonly #owners = new Map<Element, StepNode>();
  readonly #listeners = new Set<() => void>();
  readonly #groups = new Map<string, StepNode>();
  readonly #statuses = new WeakMap<StepNode, StepStatus>();
  readonly #position: StepPosition;
  #unsubscribePosition: (() => void) | undefined;
  #layout: Layout | undefined;
  #tree: readonly StepTreeEntry[] | undefined;
  #path: StepPath = [];
  #pathValid = false;

  /**
   * @param options.position The position in the steps of the slide, which may
   *   be shared with the stores of other views. Defaults to a position of
   *   this store, which starts at `options.target`.
   * @param options.target Initial path to show.
   * @param options.toEnd Whether to also show all steps nested in
   *   `options.target` initially, e.g., all steps of a slide rendered outside
   *   of a deck.
   */
  constructor({
    position,
    target = [],
    toEnd = false,
  }: {
    position?: StepPosition;
    target?: StepPath;
    toEnd?: boolean;
  } = {}) {
    this.#position = position ?? createStepPosition({ path: target, toEnd });
  }

  /**
   * Registers `element` as an element of the stepper `node`.
   *
   * @returns A function that unregisters the element.
   */
  attach(node: StepNode, element: Element, options: StepOptions): () => void {
    node.elements.set(element, options);
    this.#owners.set(element, node);
    this.#nodes.add(node);
    this.#invalidateLayout();
    return () => {
      node.elements.delete(element);
      if (this.#owners.get(element) === node) {
        this.#owners.delete(element);
      }
      if (node.elements.size === 0) {
        this.#nodes.delete(node);
      }
      this.#invalidateLayout();
    };
  }

  /**
   * Returns the stepper shared by the elements of the group `name`.
   *
   * Groups only have to be unique on a slide, since only the elements of the
   * current slide are attached.
   */
  getGroup(name: string): StepNode {
    let node = this.#groups.get(name);
    if (node === undefined) {
      node = new StepNode();
      this.#groups.set(name, node);
    }
    return node;
  }

  subscribe = (listener: () => void): (() => void) => {
    // Only follow the position while someone listens, so that stores of
    // unmounted views don't leak.
    this.#unsubscribePosition ??= this.#position.subscribe(() => {
      this.#invalidatePath();
    });
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        this.#unsubscribePosition?.();
        this.#unsubscribePosition = undefined;
      }
    };
  };

  /** Returns the current path. The result is stable while it doesn't change. */
  getPath = (): StepPath => {
    if (!this.#pathValid) {
      const path = this.#resolvePath();
      if (!pathsEqual(path, this.#path)) {
        this.#path = path;
      }
      this.#pathValid = true;
    }
    return this.#path;
  };

  /**
   * Returns the status of the stepper `node`. The result is stable while it
   * doesn't change.
   */
  getStatus(node: StepNode): StepStatus {
    const status = this.#computeStatus(node);
    const cached = this.#statuses.get(node);
    if (
      cached?.stepIndex === status.stepIndex &&
      cached.phase === status.phase &&
      cached.isOpen === status.isOpen &&
      cached.inherited === status.inherited
    ) {
      return cached;
    }
    this.#statuses.set(node, status);
    return status;
  }

  /**
   * Shows `target`, dropping any steps that don't exist.
   *
   * @param toEnd Whether to also show all steps nested in `target`.
   */
  reset(target: StepPath = [], toEnd = false): void {
    this.#position.set({ path: target, toEnd });
    if (this.#unsubscribePosition === undefined) {
      // Nobody follows the position, so we have to forget the path ourselves.
      this.#invalidatePath();
    }
  }

  /**
   * Advances to the next step: into the first step nested in the current one,
   * to the next step on the same level, or to the next step of an enclosing
   * level.
   *
   * @returns `false` if there are no more steps on the slide.
   */
  next(): boolean {
    const target = this.#findNext();
    if (target === undefined) {
      return false;
    }
    this.reset(target);
    return true;
  }

  /** Whether there are more steps on the slide, i.e., {@link next} would advance. */
  hasNext(): boolean {
    return this.#findNext() !== undefined;
  }

  #findNext(): StepPath | undefined {
    const { levelSizes } = this.#getLayout();
    // Levels nested in step 0 are shown along with their enclosing level, so
    // we have to look for the next step in them first.
    const path = [...this.getPath()];
    while (levelSizes.has(levelKey([...path, 0]))) {
      path.push(0);
    }
    for (let depth = path.length; depth >= 0; depth -= 1) {
      const level = path.slice(0, depth);
      const position = path[depth] ?? 0;
      if (position < (levelSizes.get(levelKey(level)) ?? 0)) {
        return [...level, position + 1];
      }
    }
    return undefined;
  }

  /**
   * Goes back to the previous step, showing all steps nested inside it.
   * This is the inverse of {@link next}.
   *
   * @returns `false` if no steps are shown on the slide.
   */
  previous(): boolean {
    const path = this.getPath();
    const position = path.at(-1);
    if (position === undefined) {
      return false;
    }
    // Show all steps nested in the previous step, including step 0.
    this.reset([...path.slice(0, -1), position - 1], true);
    return true;
  }

  /**
   * Returns the steps of the slide as a tree, where the steps on each level
   * are followed by the steps nested in them. Steps nested in step 0 of a
   * level, which is shown along with the level, come before the other steps of
   * the level. The result is stable while the steppers don't change, but it
   * doesn't follow changes of their text.
   */
  getTree = (): readonly StepTreeEntry[] => {
    this.#tree ??= this.#computeTree([]);
    return this.#tree;
  };

  #computeTree(level: StepPath): StepTreeEntry[] {
    const { anchors, placements, levelSizes } = this.#getLayout();
    const key = levelKey(level);
    const size = levelSizes.get(key);
    if (size === undefined) {
      return [];
    }
    // Steppers on this level in document order.
    const steppers = [...anchors]
      .sort(([, x], [, y]) => compareDocumentOrder(x.element, y.element))
      .flatMap(([node]) => {
        const placement = placements.get(node);
        return placement !== undefined && levelKey(placement.level) === key
          ? [[node, placement] as const]
          : [];
      });
    const entries = this.#computeTree([...level, 0]);
    for (let step = 1; step <= size; step += 1) {
      const labels = steppers
        .filter(([, { first, last }]) => first <= step && step <= last)
        .map(([node, { first, last }]) => {
          const text =
            anchors.get(node)?.options.title?.trim() ?? this.#textOf(node);
          return last > first && text !== ''
            ? `${text} (${String(step - first + 1)}/${String(last - first + 1)})`
            : text;
        })
        .filter((label) => label !== '');
      const path = [...level, step];
      entries.push({
        path,
        label: labels.join(' · '),
        children: this.#computeTree(path),
      });
    }
    return entries;
  }

  /** Returns the text of the elements of `node`, in document order. */
  #textOf(node: StepNode): string {
    return [...node.elements.keys()]
      .sort(compareDocumentOrder)
      .map((element) =>
        textOf(element, (descendant) => {
          const owner = this.#owners.get(descendant);
          return owner !== undefined && owner !== node;
        }),
      )
      .filter((text) => text !== '')
      .join(' ');
  }

  #invalidateLayout() {
    this.#layout = undefined;
    this.#tree = undefined;
    this.#invalidatePath();
  }

  #invalidatePath() {
    this.#pathValid = false;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #getLayout(): Layout {
    this.#layout ??= this.#computeLayout();
    return this.#layout;
  }

  #computeLayout(): Layout {
    const anchors = new Map<StepNode, Anchor>();
    for (const node of this.#nodes) {
      const anchor = this.#findAnchor(node);
      if (anchor !== undefined && anchor.options.count >= 1) {
        anchors.set(node, anchor);
      }
    }
    // The steppers to place each stepper right after, if any.
    const predecessors = new Map<StepNode, StepNode>();
    const sorted = [...anchors].sort(([, x], [, y]) =>
      compareDocumentOrder(x.element, y.element),
    );
    for (const [node, { options }] of sorted) {
      const predecessor = this.#findGroup(options.after, node, anchors);
      if (predecessor !== undefined) {
        predecessors.set(node, predecessor);
      }
    }
    // Steppers may be placed after each other in a cycle, which we break at
    // the first one in document order, which is placed by its elements.
    for (const [node] of sorted) {
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
    const parents = new Map<StepNode, StepNode | undefined>();
    const findParent = (node: StepNode): StepNode | undefined => {
      if (parents.has(node)) {
        return parents.get(node);
      }
      const anchor = anchors.get(node);
      if (anchor === undefined) {
        return undefined;
      }
      const predecessor = predecessors.get(node);
      const parent =
        predecessor === undefined
          ? (this.#findGroup(anchor.options.parent, node, anchors) ??
            this.#findParent(node, anchor.element, anchors))
          : findParent(predecessor);
      // A stepper placed after one nested in it ends up in itself.
      const result = parent === node ? undefined : parent;
      parents.set(node, result);
      return result;
    };
    for (const node of anchors.keys()) {
      findParent(node);
    }
    const order = orderSteppers(sorted, predecessors);
    const depths = new Map<StepNode, number>();
    const getDepth = (node: StepNode, visited: Set<StepNode>): number => {
      let depth = depths.get(node);
      if (depth === undefined) {
        const parent = parents.get(node);
        // Groups may nest in each other in a cycle, which we break by treating
        // the stepper we came back to as top-level.
        depth =
          parent === undefined || visited.has(parent)
            ? 0
            : getDepth(parent, visited.add(node)) + 1;
        depths.set(node, depth);
      }
      return depth;
    };
    // Enclosing steppers are placed before the steppers nested in them, and
    // steppers on the same level are placed in document order, except for
    // those placed right after another one.
    const placementOrder = sorted.toSorted(
      ([a], [b]) =>
        getDepth(a, new Set()) - getDepth(b, new Set()) ||
        (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
    const placements = new Map<StepNode, Placement>();
    const levelSizes = new Map<string, number>();
    // Number of the last step of the previous stepper on each level.
    const previousSteps = new Map<string, number>();
    for (const [node, { options }] of placementOrder) {
      const { count, placement } = options;
      const parentNode = parents.get(node);
      const parent =
        parentNode === undefined ? undefined : placements.get(parentNode);
      const level = parent === undefined ? [] : [...parent.level, parent.last];
      const key = levelKey(level);
      const size = levelSizes.get(key) ?? 0;
      const previous = previousSteps.get(key);
      let first: number;
      if (placement === 'initial') {
        first = 0;
      } else if (placement === 'previous') {
        // Without a previous stepper, there is nothing to join but step 0.
        first = previous ?? 0;
      } else {
        first = size + 1;
      }
      const last = first + count - 1;
      placements.set(node, { level, first, last });
      levelSizes.set(key, Math.max(size, last));
      previousSteps.set(key, last);
    }
    return { anchors, parents, placements, levelSizes };
  }

  /**
   * Returns the element that determines the placement of `node`: its least
   * nested element, or the first one in document order among those. Thus,
   * elements of a group nested in other steps belong to the group at an outer
   * level.
   */
  #findAnchor(node: StepNode): Anchor | undefined {
    let anchor: Anchor | undefined;
    let anchorDepth = Number.POSITIVE_INFINITY;
    for (const [element, options] of node.elements) {
      const depth = this.#countEnclosingSteps(node, element);
      if (
        depth < anchorDepth ||
        (depth === anchorDepth &&
          anchor !== undefined &&
          compareDocumentOrder(element, anchor.element) < 0)
      ) {
        anchor = { element, options };
        anchorDepth = depth;
      }
    }
    return anchor;
  }

  #countEnclosingSteps(node: StepNode, element: Element): number {
    let depth = 0;
    for (
      let ancestor = element.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      const owner = this.#owners.get(ancestor);
      if (owner !== undefined && owner !== node) {
        depth += 1;
      }
    }
    return depth;
  }

  /** Returns the stepper of the group `name` if it is placed, except `node`. */
  #findGroup(
    name: string | undefined,
    node: StepNode,
    anchors: Map<StepNode, Anchor>,
  ): StepNode | undefined {
    const group = name === undefined ? undefined : this.#groups.get(name);
    return group !== undefined && group !== node && anchors.has(group)
      ? group
      : undefined;
  }

  /** Finds the closest stepper enclosing `element` of `node`. */
  #findParent(
    node: StepNode,
    element: Element,
    anchors: Map<StepNode, Anchor>,
  ): StepNode | undefined {
    for (
      let ancestor = element.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      const owner = this.#owners.get(ancestor);
      if (owner !== undefined && owner !== node && anchors.has(owner)) {
        return owner;
      }
    }
    return undefined;
  }

  #resolvePath(): StepPath {
    const { levelSizes } = this.#getLayout();
    const { path: target, toEnd } = this.#position.get();
    const path: number[] = [];
    for (const position of target) {
      const size = levelSizes.get(levelKey(path)) ?? 0;
      if (!Number.isInteger(position) || position < 0 || position > size) {
        break;
      }
      path.push(position);
    }
    if (toEnd) {
      // Go to the last step of each nested level, including the levels nested
      // in step 0 if there are no other steps.
      for (;;) {
        const size = levelSizes.get(levelKey(path));
        if (size === undefined) {
          break;
        }
        path.push(size);
      }
    }
    return trimPath(path);
  }

  #computeStatus(node: StepNode): StepStatus {
    const place = this.#computePlace(node);
    const parent = this.#getLayout().parents.get(node);
    if (parent === undefined) {
      return { ...place, isOpen: true, inherited: SHOWN };
    }
    const parentPhase = this.#computePlace(parent).phase;
    return {
      ...place,
      isOpen: parentPhase === 'current' || parentPhase === 'parent',
      inherited: this.#computeAppearance(parent, new Set([node])),
    };
  }

  /**
   * Returns how `node` looks, at least as hidden as the steppers it is nested
   * in, whether in the DOM or explicitly.
   */
  #computeAppearance(node: StepNode, visited: Set<StepNode>): RankedAppearance {
    if (visited.has(node)) {
      // Groups may nest in each other in a cycle.
      return SHOWN;
    }
    visited.add(node);
    const { anchors, parents } = this.#getLayout();
    const { phase } = this.#computePlace(node);
    const own = anchors.get(node)?.options.appearances?.[phase] ?? SHOWN;
    const parent = parents.get(node);
    return parent === undefined
      ? own
      : moreHidden(own, this.#computeAppearance(parent, visited));
  }

  #computePlace(node: StepNode): StepPlace {
    const placement = this.#getLayout().placements.get(node);
    if (placement === undefined) {
      return FUTURE;
    }
    const { level, first, last } = placement;
    const path = this.getPath();
    for (const [depth, step] of level.entries()) {
      const position = path[depth] ?? 0;
      if (position !== step) {
        // The enclosing step is either already done or not yet shown.
        return position > step ? PAST : FUTURE;
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
    const nested = path[level.length + 1] ?? 0;
    return {
      stepIndex: position - first,
      phase: nested > 0 ? 'parent' : 'current',
    };
  }
}
