import { createStepPosition, type StepPosition } from './StepPosition.ts';

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

/** State of a stepper as stored in a {@link StepStore}. */
export interface StepStatus {
  /**
   * Zero-based index of the current step of the stepper, `-1` if the stepper
   * is not yet active, or `Infinity` if all steps should be shown.
   */
  stepIndex: number;
  /** Whether the current step of the slide is one of the steps of the stepper. */
  isCurrent: boolean;
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
  placements: Map<StepNode, Placement>;
  /**
   * Number of the last step on each level, keyed by {@link levelKey}.
   * Levels with only step 0 have size 0.
   */
  levelSizes: Map<string, number>;
}

const INACTIVE: StepStatus = { stepIndex: -1, isCurrent: false };

const SHOW_ALL: StepStatus = {
  stepIndex: Number.POSITIVE_INFINITY,
  isCurrent: false,
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
  readonly #showAll: boolean;
  readonly #nodes = new Set<StepNode>();
  readonly #owners = new Map<Element, StepNode>();
  readonly #listeners = new Set<() => void>();
  readonly #groups = new Map<string, StepNode>();
  readonly #statuses = new WeakMap<StepNode, StepStatus>();
  readonly #position: StepPosition;
  #unsubscribePosition: (() => void) | undefined;
  #layout: Layout | undefined;
  #path: StepPath = [];
  #pathValid = false;

  /**
   * @param options.position The position in the steps of the slide, which may
   *   be shared with the stores of other views. Defaults to a position of
   *   this store, which starts at `options.target`.
   * @param options.target Initial path to show.
   * @param options.showAll Whether to show all steps without navigation, e.g.,
   *   when rendering a slide outside of a deck.
   */
  constructor({
    position,
    target = [],
    showAll = false,
  }: {
    position?: StepPosition;
    target?: StepPath;
    showAll?: boolean;
  } = {}) {
    this.#position =
      position ?? createStepPosition({ path: target, toEnd: false });
    this.#showAll = showAll;
  }

  /**
   * Registers `element` as an element of the stepper `node`.
   *
   * @returns A function that unregisters the element.
   */
  attach(node: StepNode, element: Element, options: StepOptions): () => void {
    if (this.#showAll) {
      return () => undefined;
    }
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
    if (this.#showAll) {
      return SHOW_ALL;
    }
    const status = this.#computeStatus(node);
    const cached = this.#statuses.get(node);
    if (
      cached?.stepIndex === status.stepIndex &&
      cached.isCurrent === status.isCurrent
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
        this.reset([...level, position + 1]);
        return true;
      }
    }
    return false;
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

  #invalidateLayout() {
    this.#layout = undefined;
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
    const parents = new Map<StepNode, StepNode | undefined>();
    for (const [node, { element }] of anchors) {
      parents.set(node, this.#findParent(node, element, anchors));
    }
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
    // steppers on the same level are placed in document order.
    const sorted = [...anchors].sort(
      ([a, { element: x }], [b, { element: y }]) =>
        getDepth(a, new Set()) - getDepth(b, new Set()) ||
        compareDocumentOrder(x, y),
    );
    const placements = new Map<StepNode, Placement>();
    const levelSizes = new Map<string, number>();
    // Number of the last step of the previous stepper on each level.
    const previousSteps = new Map<string, number>();
    for (const [node, { options }] of sorted) {
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
    return { placements, levelSizes };
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
    const placement = this.#getLayout().placements.get(node);
    if (placement === undefined) {
      return INACTIVE;
    }
    const { level, first, last } = placement;
    const path = this.getPath();
    for (const [depth, step] of level.entries()) {
      const position = path[depth] ?? 0;
      if (position !== step) {
        // The enclosing step is either already done or not yet shown.
        return position > step ? SHOW_ALL : INACTIVE;
      }
    }
    const position = path[level.length] ?? 0;
    if (position < first) {
      return INACTIVE;
    }
    if (position > last) {
      return SHOW_ALL;
    }
    return { stepIndex: position - first, isCurrent: true };
  }
}
