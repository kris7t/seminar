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
}

/**
 * The ranges of the elements of decks, by the objects of their props, which
 * React gives to the fibers of the elements, too, and which components get. So
 * they get no props or parents that they wouldn't have without this.
 */
const ranges = new WeakMap<object, SourceRange>();

const RANGE = /^(\d+):(\d+)-(\d+):(\d+)$/;

function parseRange(range: string): SourceRange | undefined {
  const match = RANGE.exec(range);
  return match === null
    ? undefined
    : {
        start: { line: Number(match[1]), column: Number(match[2]) },
        end: { line: Number(match[3]), column: Number(match[4]) },
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
): T {
  const parsed = parseRange(range);
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
  for (let fiber = currentFiber(); fiber; fiber = fiber.return) {
    const range =
      (fiber.pendingProps && ranges.get(fiber.pendingProps)) ??
      (fiber.memoizedProps && ranges.get(fiber.memoizedProps));
    if (range) {
      return range;
    }
  }
  return undefined;
}
