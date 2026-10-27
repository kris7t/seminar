import {
  fadesOf,
  pickFade,
  sidesOf,
  type FadeValues,
} from '../transitions/fades.ts';
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
  moreHidden,
  SHOWN,
  type RankedAppearance,
  type RankedAppearances,
} from './stepAppearance.ts';
import {
  parseSlideSplit,
  planSplit,
  type SlideSplit,
  type SlideSplitProp,
  type SplitMode,
  type StepSplit,
} from './stepSplit.ts';

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
 * - `'distantFuture'`: like `'future'`, but the step the stepper is nested in
 *   (in the DOM or with `in`), or one enclosing that, isn't shown yet either.
 * - `'future'`: the stepper isn't shown yet.
 * - `'current'`: the current step of the slide is one of the steps of the
 *   stepper.
 * - `'open'`: like `'current'`, but a step nested inside the stepper has been
 *   shown since, which is the current step of the slide or encloses it.
 * - `'past'`: a later step on the same level has been shown.
 * - `'distantPast'`: like `'past'`, but the step the stepper is nested in, or
 *   one enclosing that, is past, too.
 *
 * Steppers that aren't nested in any step are never in the distant phases.
 */
export type StepPhase =
  'distantFuture' | 'future' | 'current' | 'open' | 'past' | 'distantPast';

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
   * Placement instead of `placement` if the stepper has no other elements,
   * i.e., it doesn't join an existing group.
   */
  defaultPlacement?: StepPlacement | undefined;
  /**
   * Group of the stepper to nest the stepper in, instead of the stepper
   * enclosing its elements, or an element whose stepper, or the stepper
   * enclosing it, to nest the stepper in.
   */
  parent?: string | Element | undefined;
  /**
   * Like `parent`, but only if the stepper has no other elements, i.e., it
   * doesn't join an existing group.
   */
  defaultParent?: string | Element | undefined;
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
  /**
   * How long the slide fades when the turn of the stepper starts or ends,
   * which applies along with those of the other elements of the stepper.
   */
  fades?: FadeValues | undefined;
  /**
   * How the stepper asks for pages when the slide is split into pages, where
   * a missing mode is taken from the stepper it is nested in.
   */
  split?: StepSplit | undefined;
  /**
   * Whether the stepper may cover other content, which then also needs a page
   * without it when the slide is split into pages, e.g., callouts.
   */
  overlay?: boolean | undefined;
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
  /** Whether a stepper of the step may cover other content. */
  overlay: boolean;
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

const DISTANT_FUTURE: StepPlace = { stepIndex: -1, phase: 'distantFuture' };

const DISTANT_PAST: StepPlace = {
  stepIndex: Number.POSITIVE_INFINITY,
  phase: 'distantPast',
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
  /** Elements in the steps of groups that they aren't inside of. */
  readonly #elementGroups = new Map<Element, string>();
  readonly #statuses = new WeakMap<StepNode, StepStatus>();
  readonly #position: StepPosition;
  #unsubscribePosition: (() => void) | undefined;
  #layout: Layout | undefined;
  #range: StepRange | undefined;
  #bounds: StepBounds = {};
  /** The paths of the steps of the slide in order, while the layout lasts. */
  #positionsCache: StepPath[] | undefined;
  /** The paths of the steps in the range, while the layout and range last. */
  #rangeCache: StepPath[] | undefined;
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
      cached.inherited === status.inherited
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
    this.#splitCache ??= this.#computeSplitPaths();
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
      const groupPath = this.#groupPath(group);
      return groupPath === undefined ? undefined : [...groupPath, ...relative];
    });
  }

  /** Returns the paths of the steps of the slide in order, starting with []. */
  #positions(): StepPath[] {
    if (this.#positionsCache === undefined) {
      const positions: StepPath[] = [[]];
      for (
        let position = this.#findNext([]);
        position !== undefined;
        position = this.#findNext(position)
      ) {
        positions.push(position);
      }
      this.#positionsCache = positions;
    }
    return this.#positionsCache;
  }

  /**
   * Returns the paths of the steps in the range of the slide in order, or the
   * last step if none of them is.
   */
  #positionsInRange(): StepPath[] {
    if (this.#rangeCache === undefined) {
      const positions = this.#positions();
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
    // Refer to the step by its group if possible, so that it stays shown when
    // steps are added before it, e.g., when the slide is edited.
    const { group, path } = this.describePath(target);
    const texts = this.#textsOf(target);
    this.#position.set(
      group === undefined
        ? { path: target, texts, toEnd, inRange }
        : { path, group, fallback: target, texts, toEnd, inRange },
    );
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
    const target = this.#position.get();
    if (target.toEnd || target.texts !== undefined) {
      return;
    }
    const path = this.getPath();
    if (target.group === undefined) {
      if (pathsEqual(path, trimPath([...target.path]))) {
        const texts = this.#textsOf(path);
        if (texts !== undefined) {
          this.#position.set({ ...target, texts });
        }
      }
    } else if (
      target.fallback === undefined &&
      this.#groupPath(target.group) !== undefined
    ) {
      this.#position.set({
        ...target,
        fallback: path,
        texts: this.#textsOf(path),
      });
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

  /** Finds the next step after the current one that is in the range. */
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
    const fades = [...this.#nodes].flatMap((node) => {
      const before = this.#computePlace(node, from);
      const after = this.#computePlace(node, target);
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
    let position = this.#findNext(this.getPath());
    while (position !== undefined && !this.isInRange(position)) {
      position = this.#findNext(position);
    }
    return position;
  }

  /** Finds the step after `from`, regardless of the range. */
  #findNext(from: StepPath): StepPath | undefined {
    const { levelSizes } = this.#getLayout();
    // Levels nested in step 0 are shown along with their enclosing level, so
    // we have to look for the next step in them first.
    const path = [...from];
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
        overlay: steppers.some(
          ([node, { first, last }]) =>
            first <= step && step <= last && this.#isOverlay(node),
        ),
        children: this.#computeTree(path),
      });
    }
    return entries;
  }

  /**
   * Returns the texts shown by the step at `path`: the text of each element of
   * each stepper that shows it, without the steps nested in them, along with
   * which step of the stepper it is. Each element counts on its own, so that
   * steps still match in part if elements move between steppers.
   *
   * @returns The texts in order, or `undefined` if the step shows no text, or
   *   the slide has no such step.
   */
  #textsOf(path: StepPath): readonly string[] | undefined {
    const step = path.at(-1);
    if (step === undefined || step === 0) {
      return undefined;
    }
    const key = levelKey(path.slice(0, -1));
    const texts: string[] = [];
    for (const [node, { level, first, last }] of this.#getLayout().placements) {
      if (levelKey(level) !== key || step < first || step > last) {
        continue;
      }
      for (const element of node.elements.keys()) {
        const text = textOf(element, (descendant) => {
          const owner = this.#owners.get(descendant);
          return owner !== undefined && owner !== node;
        });
        if (text !== '') {
          texts.push(`${String(step - first)}\u0000${text}`);
        }
      }
    }
    return texts.length === 0 ? undefined : texts.sort();
  }

  /**
   * Finds the step that shows the most of `texts`, preferring `path`, and
   * then the steps closest to it. Returns `path` if no step shows any of them.
   */
  #findByTexts(path: StepPath, texts: readonly string[]): StepPath {
    const own = this.#textsOf(path);
    if (own !== undefined && overlapOf(own, texts) === 1) {
      return path;
    }
    const positions = this.#positions();
    const index = positions.findIndex(
      (position) => compareStepPaths(position, path) >= 0,
    );
    const origin = index === -1 ? positions.length : index;
    let best = path;
    let bestOverlap = own === undefined ? 0 : overlapOf(own, texts);
    let bestDistance = 0;
    for (const [position, candidate] of positions.entries()) {
      const candidateTexts = this.#textsOf(candidate);
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
    this.#positionsCache = undefined;
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
    // Steppers that are inert by default, e.g., paragraphs without steps of
    // their own, don't nest the steppers inside them, which are nested in the
    // parent of the inert stepper instead, as if it wasn't there.
    const isTransparent = (node: StepNode): boolean => {
      const options = anchors.get(node)?.options;
      return (
        node.elements.size === 1 && options?.defaultPlacement !== undefined
      );
    };
    const visiting = new Set<StepNode>();
    const findParent = (node: StepNode): StepNode | undefined => {
      if (parents.has(node)) {
        return parents.get(node);
      }
      const anchor = anchors.get(node);
      if (anchor === undefined) {
        return undefined;
      }
      const predecessor = predecessors.get(node);
      const parentOption =
        anchor.options.parent ??
        (node.elements.size === 1 ? anchor.options.defaultParent : undefined);
      const parent =
        predecessor === undefined
          ? typeof parentOption === 'object'
            ? this.#findParent(node, parentOption, anchors, true)
            : (this.#findGroup(parentOption, node, anchors) ??
              this.#findParent(node, anchor.element, anchors))
          : findParent(predecessor);
      visiting.add(node);
      let result = parent;
      while (
        result !== undefined &&
        result !== node &&
        !visiting.has(result) &&
        isTransparent(result)
      ) {
        result = findParent(result);
      }
      visiting.delete(node);
      // A stepper placed after one nested in it ends up in itself.
      if (result === node || (result !== undefined && visiting.has(result))) {
        result = undefined;
      }
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
      const { count } = options;
      const placement =
        node.elements.size === 1
          ? (options.defaultPlacement ?? options.placement)
          : options.placement;
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

  /**
   * Finds the closest stepper enclosing `element` of `node`, or that
   * `element` is an element of, if `inclusive`, including the steppers of the
   * groups that elements are added to (see {@link addToGroup}).
   */
  #findParent(
    node: StepNode,
    element: Element,
    anchors: Map<StepNode, Anchor>,
    inclusive = false,
  ): StepNode | undefined {
    for (
      let ancestor = inclusive ? element : element.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      const group = this.#findGroup(
        this.#elementGroups.get(ancestor),
        node,
        anchors,
      );
      if (group !== undefined) {
        return group;
      }
      const owner = this.#owners.get(ancestor);
      if (owner !== undefined && owner !== node && anchors.has(owner)) {
        return owner;
      }
    }
    return undefined;
  }

  /**
   * Returns the path of the first step of the group `name`, or `undefined` if
   * the slide has no such group.
   */
  #groupPath(name: string): StepPath | undefined {
    const node = this.#groups.get(name);
    const placement =
      node === undefined ? undefined : this.#getLayout().placements.get(node);
    return placement === undefined
      ? undefined
      : trimPath([...placement.level, placement.first]);
  }

  /**
   * Describes `path` relative to the first step of a step group, if it is
   * that step or nested in it, so that it can be referred to by the name of
   * the group. If there are several such groups, the most nested one is used,
   * or the first one in document order among those.
   *
   * @returns The name of the group, if any, and the rest of the path.
   */
  describePath(path: StepPath): { group?: string; path: StepPath } {
    const { anchors } = this.#getLayout();
    const groups = [...this.#groups]
      .flatMap(([name, node]) => {
        const anchor = anchors.get(node);
        return anchor === undefined ? [] : [{ name, anchor }];
      })
      .sort((a, b) => compareDocumentOrder(a.anchor.element, b.anchor.element));
    let best: { group?: string; path: StepPath } = { path };
    let bestLength = 0;
    for (const { name } of groups) {
      const groupPath = this.#groupPath(name) ?? [];
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

  #resolvePath(): StepPath {
    const { levelSizes } = this.#getLayout();
    const {
      path: relative,
      group,
      fallback = [],
      texts,
      toEnd,
      inRange,
    } = this.#position.get();
    const groupPath = group === undefined ? [] : this.#groupPath(group);
    let target =
      groupPath === undefined ? fallback : [...groupPath, ...relative];
    // Steps without their group are found by their texts instead.
    if (
      texts !== undefined &&
      (group === undefined || groupPath === undefined)
    ) {
      target = this.#findByTexts(target, texts);
    }
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
    const resolved = trimPath(path);
    if (inRange !== true || this.isInRange(resolved)) {
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
    const place = this.#computePlace(node);
    const parent = this.#getLayout().parents.get(node);
    if (parent === undefined) {
      return { ...place, inherited: SHOWN };
    }
    return {
      ...place,
      inherited: this.#computeAppearance(parent, new Set([node])),
    };
  }

  /**
   * Returns how `node` looks, at least as hidden as the steppers it is nested
   * in, whether in the DOM or explicitly.
   */
  #computeAppearance(
    node: StepNode,
    visited: Set<StepNode>,
    path = this.getPath(),
  ): RankedAppearance {
    if (visited.has(node)) {
      // Groups may nest in each other in a cycle.
      return SHOWN;
    }
    visited.add(node);
    const { anchors, parents } = this.#getLayout();
    const { phase } = this.#computePlace(node, path);
    const own = anchors.get(node)?.options.appearances?.[phase] ?? SHOWN;
    const parent = parents.get(node);
    return parent === undefined
      ? own
      : moreHidden(own, this.#computeAppearance(parent, visited, path));
  }

  /** Whether an element of `node` is an overlay. */
  #isOverlay(node: StepNode): boolean {
    return [...node.elements.values()].some(({ overlay }) => overlay === true);
  }

  /**
   * Returns the split mode of `node`: `'each'` if an element asks for it,
   * `'none'` if all of them do, or else `'auto'`, where elements without a
   * mode take that of the stepper `node` is nested in, or of the slide.
   */
  #splitModeOf(node: StepNode, visited: Set<StepNode>): SplitMode {
    const parent = this.#getLayout().parents.get(node);
    let inherited: SplitMode | undefined;
    const getInherited = () => {
      inherited ??=
        parent === undefined || visited.has(parent)
          ? (this.#slideSplit?.mode ?? 'auto')
          : this.#splitModeOf(parent, visited.add(node));
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

  #computeSplitPaths(): readonly StepPath[] {
    const states = this.#positionsInRange();
    const { anchors } = this.#getLayout();
    const nodes = [...anchors.keys()];
    const isLegible = (node: StepNode, path: StepPath) =>
      this.#computeAppearance(node, new Set(), path).rank <= this.#legibleRank;
    const legibleStates = (
      node: StepNode,
      when: (place: StepPlace) => boolean = () => true,
    ) =>
      new Set(
        states.flatMap((path, index) =>
          when(this.#computePlace(node, path)) && isLegible(node, path)
            ? [index]
            : [],
        ),
      );
    const overlays = nodes.filter((node) => this.#isOverlay(node));
    const covered = new Set(
      states.flatMap((path, index) =>
        overlays.some((node) => isLegible(node, path)) ? [index] : [],
      ),
    );
    // Content is read without overlays before they cover it, unless it's
    // shown along with them, which then likely don't cover it.
    const uncoveredOf = (unit: ReadonlySet<number>): ReadonlySet<number> => {
      const shown = [...unit].sort((a, b) => a - b);
      const firstCovered = shown.find((index) => covered.has(index));
      const before = shown.filter(
        (index) => firstCovered === undefined || index < firstCovered,
      );
      return before.length > 0 ? new Set(before) : unit;
    };
    // Content outside of steps is shown in every state.
    const units: ReadonlySet<number>[] = [uncoveredOf(new Set(states.keys()))];
    const forced: number[] = [];
    for (const node of nodes) {
      const mode = this.#splitModeOf(node, new Set());
      const count = anchors.get(node)?.options.count ?? 1;
      const nodeUnits =
        mode === 'none'
          ? []
          : mode === 'each'
            ? // Content shown before the stepper, e.g., by `Steps`, too.
              Array.from({ length: count + 1 }, (_, index) =>
                legibleStates(
                  node,
                  ({ stepIndex }) =>
                    Math.min(stepIndex, count - 1) === index - 1,
                ),
              )
            : [legibleStates(node)];
      const overlay = this.#isOverlay(node);
      for (const unit of nodeUnits) {
        units.push(overlay ? unit : uncoveredOf(unit));
      }
      const turn = states.flatMap((path, index) => {
        const { phase } = this.#computePlace(node, path);
        return phase === 'current' || phase === 'open' ? [index] : [];
      });
      const first = turn[0];
      const last = turn.at(-1);
      if (first === undefined || last === undefined) {
        continue;
      }
      const points = new Set(
        [...node.elements.values()].flatMap(({ split }) => [
          ...(split?.points ?? []),
        ]),
      );
      if (points.has('before') && first > 0) {
        forced.push(first - 1);
      }
      if (points.has('initial')) {
        forced.push(first);
      }
      if (points.has('last')) {
        forced.push(last);
      }
    }
    for (const { group, path } of this.#slideSplit?.pages ?? []) {
      const groupPath = group === undefined ? [] : this.#groupPath(group);
      if (groupPath === undefined) {
        continue;
      }
      const target = [...groupPath, ...path];
      const index = states.findIndex(
        (state) => compareStepPaths(state, target) === 0,
      );
      if (index >= 0) {
        forced.push(index);
      }
    }
    return planSplit(states.length, units, forced).map(
      (index) => states[index] ?? [],
    );
  }

  #computePlace(node: StepNode, path = this.getPath()): StepPlace {
    const placement = this.#getLayout().placements.get(node);
    if (placement === undefined) {
      return FUTURE;
    }
    const { level, first, last } = placement;
    for (const [depth, step] of level.entries()) {
      const position = path[depth] ?? 0;
      if (position !== step) {
        // The enclosing step is either already done or not yet shown.
        return position > step ? DISTANT_PAST : DISTANT_FUTURE;
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
      phase: nested > 0 ? 'open' : 'current',
    };
  }
}
