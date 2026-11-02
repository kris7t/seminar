import * as React from 'react';
import type { ReactElement } from 'react';

/** A position in the source of a deck, from 1. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** Where an element of a deck is in its source. */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
  /** The path of the file, if it's known, which is the deck or one it includes. */
  file?: string | undefined;
}

/**
 * The ranges of the elements of decks, by the objects of their props, which
 * React gives to the fibers of the elements, too, and which components get. So
 * they get no props or parents that they wouldn't have without this.
 */
const ranges = new WeakMap<object, SourceRange>();

const RANGE = /^(\d+):(\d+)-(\d+):(\d+)$/;

function parseRange(
  range: string,
  file: string | undefined,
): SourceRange | undefined {
  const match = RANGE.exec(range);
  return match === null
    ? undefined
    : {
        start: { line: Number(match[1]), column: Number(match[2]) },
        end: { line: Number(match[3]), column: Number(match[4]) },
        ...(file === undefined ? {} : { file }),
      };
}

/**
 * Tells where `element` is in the source of its deck, as `line:column-line:column`,
 * which decks compiled for the dev server call for their elements, and returns
 * the element.
 */
export function __seminarAt<T extends ReactElement<object>>(
  element: T,
  range: string,
  file?: string,
): T {
  const parsed = parseRange(range, file);
  if (parsed !== undefined) {
    ranges.set(element.props, parsed);
  }
  return element;
}

/** Returns where the element with these props is in the source of its deck. */
export function getSourceRange(props: object): SourceRange | undefined {
  return ranges.get(props);
}

/**
 * Tells that `element` is where `original` is in the source of its deck, and
 * returns it. Elements made with `cloneElement` have new props, so they need
 * this to be found in the source themselves, rather than what is around them.
 */
export function withSourceOf<T extends ReactElement<object>>(
  element: T,
  original: ReactElement<object>,
): T {
  const range = ranges.get(original.props);
  if (range !== undefined) {
    ranges.set(element.props, range);
  }
  return element;
}

/** Returns the range of the closest fiber with one, from `first` up. */
function findInFibers(
  first: Fiber | null | undefined,
): SourceRange | undefined {
  for (let fiber = first; fiber; fiber = fiber.return) {
    const range =
      (fiber.pendingProps && ranges.get(fiber.pendingProps)) ??
      (fiber.memoizedProps && ranges.get(fiber.memoizedProps));
    if (range) {
      return range;
    }
  }
  return undefined;
}

/** What we need from the fibers of React. */
interface Fiber {
  pendingProps?: object | null;
  memoizedProps?: object | null;
  return?: Fiber | null;
}

/**
 * Returns the fiber of the component being rendered. React has no public way to
 * tell which elements a component was rendered by, without it passing on
 * something, like a prop, which authors of components would have to know about.
 * So this uses its internals, and only finds nothing if those change.
 */
function currentFiber(): Fiber | null | undefined {
  const {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: internals,
  } = React as unknown as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
      A?: { getOwner?: () => Fiber | null } | null;
    };
  };
  return internals?.A?.getOwner?.();
}

/**
 * Returns where the closest element around the component being rendered is in
 * the source of its deck, including the element of the component, if known.
 * Only works while rendering, and only in the development build of React.
 */
export function findSourceRange(): SourceRange | undefined {
  return findInFibers(currentFiber());
}

/** Prefix of the property of DOM nodes with their fibers, which is internal. */
const FIBER_PREFIX = '__reactFiber$';

/**
 * Returns where the closest element around `element` is in the source of its
 * deck, if known, from the fiber that React keeps on it, like
 * {@link findSourceRange}.
 */
export function findSourceRangeOf(element: Element): SourceRange | undefined {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const key = Object.keys(node).find((name) => name.startsWith(FIBER_PREFIX));
    if (key !== undefined) {
      return findInFibers((node as unknown as Record<string, Fiber>)[key]);
    }
  }
  return undefined;
}
