import { fadesOf, pickFade, sidesOf } from '../transitions/fades.ts';
import { createStepPosition, type StepPosition } from './StepPosition.ts';
import {
  compareStepPaths,
  isInStepRange,
  parseStepRange,
  type StepBounds,
  type StepRange,
} from './stepRange.ts';
import {
  BUILT_IN_APPEARANCE_RANKS,
  type RankedAppearance,
} from './stepAppearance.ts';
import { StepLayout, type StepPlace, type StepRegistry } from './StepLayout.ts';
import {
  describeStepPath,
  pathsEqual,
  rememberStepTarget,
  resolveStepTarget,
  stepTargetOf,
} from './stepLocation.ts';
import { computeStepPages } from './stepPages.ts';
import {
  parseSlideSplit,
  type SlideSplit,
  type SlideSplitProp,
} from './stepSplit.ts';
import { computeStepTree, type StepTreeEntry } from './stepTree.ts';
import { StepNode, type StepOptions, type StepPath } from './StepNode.ts';

/** State of a stepper as stored in a {@link StepStore}. */
export interface StepStatus extends StepPlace {
  /**
   * How the stepper it is nested in looks, including the steppers that one is
   * nested in, which the stepper should look at least as hidden as.
   */
  inherited: RankedAppearance;
  /**
   * How the stepper looks as a whole, which is how elements without a look of
   * their own look, or `undefined` before it is placed.
   */
  look?: RankedAppearance | undefined;
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
  readonly #steppers = new Map<Element, StepNode>();
  readonly #listeners = new Set<() => void>();
  readonly #groups = new Map<string, StepNode>();
  readonly #elementGroups = new Map<Element, string>();
  readonly #registry: StepRegistry = {
    nodes: this.#nodes,
    groups: this.#groups,
    steppers: this.#steppers,
    elementGroups: this.#elementGroups,
  };
  readonly #statuses = new WeakMap<StepNode, StepStatus>();
  readonly #position: StepPosition;
  #unsubscribePosition: (() => void) | undefined;
  #layout: StepLayout | undefined;
  #range: StepRange | undefined;
  #bounds: StepBounds = {};
  /** The paths of the steps in the range, while the layout and range last. */
  #rangeCache: readonly StepPath[] | undefined;
  #tree: readonly StepTreeEntry[] | undefined;
  #split: SlideSplitProp | undefined;
  #slideSplit: SlideSplit | undefined;
  #legibleRank: number = BUILT_IN_APPEARANCE_RANKS.dimmed;
  /** The paths of the pages, while the layout, range, and split last. */
  #splitCache: readonly StepPath[] | undefined;
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
    this.#position =
      position ?? createStepPosition({ path: target, toEnd, inRange: true });
  }

  /**
   * Registers `element` as an element of the stepper `node`.
   *
   * @returns A function that unregisters the element.
   */
  attach(node: StepNode, element: Element, options: StepOptions): () => void {
    node.elements.set(element, options);
    this.#steppers.set(element, node);
    this.#nodes.add(node);
    this.#invalidateLayout();
    return () => {
      node.elements.delete(element);
      if (this.#steppers.get(element) === node) {
        this.#steppers.delete(element);
      }
      if (node.elements.size === 0) {
        this.#nodes.delete(node);
      }
      this.#invalidateLayout();
    };
  }

  /**
   * Puts `element` in the step of the group `name`, as if it was inside the
   * elements of the group, e.g., a part of a figure that a step elsewhere
   * shows, so that steps nested in the step of the element, like callouts
   * pointing at it, are nested in that step. Unlike the elements of the group,
   * it doesn't place the step.
   *
   * @returns A function that takes the element out of the group.
   */
  addToGroup(element: Element, name: string): () => void {
    this.#elementGroups.set(element, name);
    this.#invalidateLayout();
    return () => {
      if (this.#elementGroups.get(element) === name) {
        this.#elementGroups.delete(element);
        this.#invalidateLayout();
      }
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
      cached.inherited === status.inherited &&
      cached.look === status.look
    ) {
      return cached;
    }
    this.#statuses.set(node, status);
    return status;
  }

  /**
   * Restricts the steps that going through the slide shows (see
   * {@link StepRange}), or lifts the restriction if `range` is `undefined`.
   */
  setRange(range: StepRange | undefined): void {
    const current = this.#range;
    if (
      current?.from === range?.from &&
      current?.after === range?.after &&
      current?.to === range?.to &&
      current?.before === range?.before &&
      current?.fromLast === range?.fromLast
    ) {
      return;
    }
    this.#range = range;
    this.#bounds = range === undefined ? {} : parseStepRange(range);
    this.#rangeCache = undefined;
    this.#splitCache = undefined;
    this.#invalidatePath();
  }

  /** Returns the range set by {@link setRange}, which is stable. */
  getRange = (): StepRange | undefined => this.#range;

  /**
   * Returns the steps in the range of the slide in order, starting with `[]`
   * if it's in the range. The result is stable while the steppers and the
   * range don't change.
   */
  getStates = (): readonly StepPath[] => this.#positionsInRange();

  /**
   * Sets how the slide is split into pages (see {@link getSplitPaths}).
   *
   * @param split The `split` of the slide.
   * @param legibleRank The rank of the most hidden appearance that pages
   *   still show content in, e.g., that of `dimmed`.
   */
  setSplit(split: SlideSplitProp | undefined, legibleRank: number): void {
    if (split === this.#split && legibleRank === this.#legibleRank) {
      return;
    }
    this.#split = split;
    this.#slideSplit = parseSlideSplit(split);
    this.#legibleRank = legibleRank;
    this.#splitCache = undefined;
    this.#invalidatePath();
  }

  /**
   * Returns the steps in the range of the slide to make pages of when the
   * slide is split into pages, e.g., for a PDF, in order. Each stepper asks
   * for pages by its `split` (see `SplitMode` and `SplitPoint`), and the last
   * step is always a page. Content of overlays, i.e., steppers that may cover
   * other content, is left out of the pages that show the content they may
   * cover, if possible. The result is stable while the steppers, the range,
   * and the split don't change.
   */
  getSplitPaths = (): readonly StepPath[] => {
    this.#splitCache ??= computeStepPages({
      layout: this.#getLayout(),
      states: this.#positionsInRange(),
      slideSplit: this.#slideSplit,
      legibleRank: this.#legibleRank,
    });
    return this.#splitCache;
  };

  /** Whether `path` is in the range of steps of the slide. */
  isInRange(path: StepPath): boolean {
    if (this.#range === undefined) {
      return true;
    }
    return this.#positionsInRange().some(
      (position) => compareStepPaths(position, path) === 0,
    );
  }

  /** Whether `path` is within the bounds of the range. */
  #isWithinBounds(path: StepPath): boolean {
    return isInStepRange(path, this.#bounds, ({ group, path: relative }) => {
      if (group === undefined) {
        return relative;
      }
      const groupPath = this.#getLayout().groupPath(group);
      return groupPath === undefined ? undefined : [...groupPath, ...relative];
    });
  }

  /**
   * Returns the paths of the steps in the range of the slide in order, or the
   * last step if none of them is.
   */
  #positionsInRange(): readonly StepPath[] {
    if (this.#rangeCache === undefined) {
      const positions = this.#getLayout().positions();
      const last = positions.at(-1) ?? [];
      const inRange =
        this.#range?.fromLast === true
          ? [last]
          : positions.filter((position) => this.#isWithinBounds(position));
      this.#rangeCache = inRange.length === 0 ? [last] : inRange;
    }
    return this.#rangeCache;
  }

  /**
   * Shows `target`, dropping any steps that don't exist.
   *
   * @param toEnd Whether to also show all steps nested in `target`.
   * @param inRange Whether to show the closest step in the range instead if
   *   `target` isn't in it.
   */
  reset(target: StepPath = [], toEnd = false, inRange = false): void {
    this.#position.set(stepTargetOf(this.#getLayout(), target, toEnd, inRange));
    if (this.#unsubscribePosition === undefined) {
      // Nobody follows the position, so we have to forget the path ourselves.
      this.#invalidatePath();
    }
  }

  /**
   * Remembers where the step shown for the position is, and its texts, if the
   * position doesn't say yet, e.g., if it comes from a link, so that the step
   * stays shown if steps are added before it, or its group is renamed or
   * removed.
   */
  rememberPath(): void {
    const target = rememberStepTarget(
      this.#getLayout(),
      this.#position.get(),
      this.getPath(),
    );
    if (target !== undefined) {
      this.#position.set(target);
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
    const target = this.#findNextInRange();
    if (target === undefined) {
      return false;
    }
    this.reset(target);
    return true;
  }

  /** Whether there are more steps on the slide, i.e., {@link next} would advance. */
  hasNext(): boolean {
    return this.#findNextInRange() !== undefined;
  }

  /** The step that {@link next} goes to, if any. */
  getNext(): StepPath | undefined {
    return this.#findNextInRange();
  }

  /** The step that {@link previous} goes to, if any. */
  getPrevious(): StepPath | undefined {
    return this.#findPreviousInRange();
  }

  /** The step that {@link first} goes to, if any. */
  getFirst(): StepPath | undefined {
    return this.#positionsInRange()[0];
  }

  /** The step that {@link last} goes to, if any. */
  getLast(): StepPath | undefined {
    return this.#positionsInRange().at(-1);
  }

  /**
   * Returns how long the slide fades from the current step to `target`, as
   * the steppers whose turn starts or ends say (see the `fade` of `Step`):
   * of the most explicit of the fades they set for the sides crossed, 0 if
   * one of those cuts, or else the longest one, or `undefined` if they set
   * none.
   */
  getFade(target: StepPath): number | undefined {
    const from = this.getPath();
    const order = compareStepPaths(target, from);
    if (order === 0) {
      return undefined;
    }
    const forward = order > 0;
    const isTurn = ({ phase }: StepPlace) =>
      phase === 'current' || phase === 'open';
    const layout = this.#getLayout();
    const fades = layout.steppers.flatMap((node) => {
      const before = layout.placeOf(node, from);
      const after = layout.placeOf(node, target);
      const moved = before.stepIndex !== after.stepIndex;
      const sides = [
        ...(isTurn(before) && (!isTurn(after) || moved)
          ? sidesOf(true, forward)
          : []),
        ...(isTurn(after) && (!isTurn(before) || moved)
          ? sidesOf(false, forward)
          : []),
      ];
      return sides.length === 0
        ? []
        : [...node.elements.values()].flatMap(({ fades: props }) =>
            props === undefined ? [] : fadesOf(props, sides, 0),
          );
    });
    return pickFade(fades);
  }

  #findNextInRange(): StepPath | undefined {
    const layout = this.#getLayout();
    let position = layout.nextOf(this.getPath());
    while (position !== undefined && !this.isInRange(position)) {
      position = layout.nextOf(position);
    }
    return position;
  }

  /**
   * Goes back to the previous step in the range, showing all steps nested
   * inside it. This is the inverse of {@link next}.
   *
   * @returns `false` if there are no steps in the range before the current one.
   */
  previous(): boolean {
    const target = this.#findPreviousInRange();
    if (target === undefined) {
      return false;
    }
    this.reset(target);
    return true;
  }

  /**
   * Whether there are steps in the range before the current one, i.e.,
   * {@link previous} would go back.
   */
  hasPrevious(): boolean {
    return this.#findPreviousInRange() !== undefined;
  }

  #findPreviousInRange(): StepPath | undefined {
    const current = this.getPath();
    return this.#positionsInRange()
      .filter((position) => compareStepPaths(position, current) < 0)
      .at(-1);
  }

  /** Goes to the first step in the range. */
  first(): void {
    this.reset([], false, true);
  }

  /** Goes to the last step in the range. */
  last(): void {
    this.reset([], true, true);
  }

  /**
   * Returns the steps of the slide as a tree, where the steps on each level
   * are followed by the steps nested in them. Steps at step 0 of a level, which
   * are shown along with the level, have an entry first, whose path ends in 0,
   * if there are any. The result is stable while the steppers don't change, but
   * it doesn't follow changes of their text.
   */
  getTree = (): readonly StepTreeEntry[] => {
    this.#tree ??= computeStepTree(this.#getLayout());
    return this.#tree;
  };

  #invalidateLayout() {
    this.#layout = undefined;
    this.#rangeCache = undefined;
    this.#tree = undefined;
    this.#splitCache = undefined;
    this.#invalidatePath();
  }

  #invalidatePath() {
    this.#pathValid = false;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #getLayout(): StepLayout {
    this.#layout ??= new StepLayout(this.#registry);
    return this.#layout;
  }

  /** See {@link describeStepPath}. */
  describePath(path: StepPath): { group?: string; path: StepPath } {
    return describeStepPath(this.#getLayout(), path);
  }

  #resolvePath(): StepPath {
    const target = this.#position.get();
    const resolved = resolveStepTarget(this.#getLayout(), target);
    if (target.inRange !== true || this.isInRange(resolved)) {
      return resolved;
    }
    // Show the closest step in the range instead.
    const positions = this.#positionsInRange();
    const first = positions[0];
    if (first === undefined) {
      return resolved;
    }
    return compareStepPaths(resolved, first) < 0
      ? first
      : (positions.at(-1) ?? first);
  }

  #computeStatus(node: StepNode): StepStatus {
    const layout = this.#getLayout();
    const path = this.getPath();
    const place = layout.placeOf(node, path);
    const inherited = layout.inheritedOf(node, path);
    return layout.stepOf(node) === undefined
      ? { ...place, inherited }
      : { ...place, inherited, look: layout.lookOf(node, path) };
  }
}
