import {
  createContext,
  createElement,
  use,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type Context,
  type ElementType,
  type JSX,
  type ReactNode,
  type RefCallback,
} from 'react';

import { DocumentSlideContext } from '../masters/DocumentMasters.tsx';

/**
 * The elements named in one rendering of a slide, e.g., with `{#name}` in
 * MDX. A deck renders a slide in several views at once, as well as in recaps
 * and copies, so names are only unique within a rendering, and every
 * rendering gives its elements ids of its own.
 */
export class SlideElementStore {
  /** Prefix of the ids of the elements in the document. */
  readonly prefix: string;
  readonly #elements = new Map<string, Element>();
  readonly #listeners = new Set<() => void>();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  /** Returns the id in the document of the element called `name`. */
  idOf(name: string): string {
    return `${this.prefix}${name}`;
  }

  /** Returns the element called `name`, if it's rendered. */
  get(name: string): Element | undefined {
    return this.#elements.get(name);
  }

  /**
   * Registers `element` as the element called `name`. If another element is
   * already called that, it keeps the name.
   *
   * @returns A function that unregisters the element.
   */
  register(name: string, element: Element): () => void {
    const existing = this.#elements.get(name);
    if (existing !== undefined && existing !== element) {
      console.warn(`There are several elements called \`${name}\` on a slide.`);
      return () => undefined;
    }
    this.#elements.set(name, element);
    this.#notify();
    return () => {
      if (this.#elements.get(name) === element) {
        this.#elements.delete(name);
        this.#notify();
      }
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const SlideElementContext: Context<SlideElementStore | undefined> =
  createContext<SlideElementStore | undefined>(undefined);

/**
 * Provides a scope of element names for a rendering of a slide (see
 * {@link SlideElementStore}).
 */
export function SlideElementScope({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  // Ids from `useId` may have characters, like colons, that need escaping in
  // selectors and in `url(#…)`. Documents have a single rendering of each
  // slide, whose ids can be readable instead.
  const documentSlide = use(DocumentSlideContext);
  const id = useId();
  const prefix =
    documentSlide === undefined
      ? `seminar-${id.replace(/[^\w-]/g, '')}-`
      : `${documentSlide.anchor}-`;
  const [store] = useState(() => new SlideElementStore(prefix));
  return <SlideElementContext value={store}>{children}</SlideElementContext>;
}

/**
 * Returns the id in the document of the element called `name` on the
 * enclosing slide. Outside of slides, it's `name` itself.
 */
export function useSlideElementId(name: string): string {
  return use(SlideElementContext)?.idOf(name) ?? name;
}

/**
 * Returns a ref that makes the element it's attached to the element called
 * `name` on the enclosing slide, for {@link useSlideElement}. Warns if there
 * are several elements called `name`.
 */
export function useSlideElementRef(name: string): RefCallback<Element> {
  const store = use(SlideElementContext);
  return useCallback(
    (element: Element | null) =>
      element === null ? undefined : store?.register(name, element),
    [store, name],
  );
}

const NO_ELEMENT = (): undefined => undefined;
const NO_SUBSCRIPTION = (): (() => void) => () => undefined;

/**
 * Returns the element `target`: the element called `target` on the enclosing
 * slide, in the same rendering of the slide, once it's rendered, or `target`
 * itself if it's an element. This lets components take either an element or
 * its name.
 */
export function useSlideElement(
  target: Element | string | undefined,
): Element | undefined {
  const store = use(SlideElementContext);
  const name = typeof target === 'string' ? target : undefined;
  const getSnapshot = useCallback(
    () => (name === undefined ? undefined : store?.get(name)),
    [store, name],
  );
  const named = useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    store === undefined ? NO_ELEMENT : getSnapshot,
    NO_ELEMENT,
  );
  return typeof target === 'object' ? target : named;
}

/**
 * The value of an attribute that refers to elements on the slide, as parts
 * that are either text or, in a single-element array, the name of an
 * element, e.g., `['url(#', ['gradient'], ')']`.
 */
export type SlideElementReference = readonly (string | readonly [string])[];

export type SlideElementProps<T extends ElementType> = {
  /** The element or component to render. */
  as: T;
  /** Name of the element on the slide, if any. */
  name?: string | undefined;
  /**
   * Attributes that refer to elements on the slide by their names, e.g., the
   * `fill` of an SVG shape, `url(#gradient)`, which get the ids of the
   * elements in the same rendering of the slide.
   */
  references?: Readonly<Record<string, SlideElementReference>> | undefined;
  /**
   * Names of elements on the slide that the `style` refers to in `url(#…)`,
   * e.g., `url('#gradient')`, which get the ids of the elements in the same
   * rendering of the slide.
   */
  styleNames?: readonly string[] | undefined;
} & Omit<ComponentProps<T>, 'id' | 'ref'>;

/** Matches references to ids in CSS, e.g., `url(#gradient)`. */
const URL_PATTERN = /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g;

/** Makes the `url(#…)` references to `names` in `style` refer to `idOf`. */
function resolveStyle(
  style: unknown,
  names: readonly string[],
  idOf: (name: string) => string,
): unknown {
  if (typeof style !== 'object' || style === null) {
    return style;
  }
  return Object.fromEntries(
    Object.entries(style).map(([property, value]) => [
      property,
      typeof value === 'string'
        ? value.replace(URL_PATTERN, (match, quote: string, name: string) =>
            names.includes(name)
              ? `url(${quote}#${idOf(name)}${quote})`
              : match,
          )
        : value,
    ]),
  );
}

/**
 * Renders `as` as the element called `name` on the enclosing slide, with an
 * id that is unique in the document, even if the slide is rendered several
 * times. Components get the id and a ref, which they should pass to their
 * root element. The `references` to other elements get their ids in the same
 * rendering of the slide.
 *
 * MDX decks render elements with an `id` in a slide like this, as well as
 * elements that refer to them, e.g., in inline SVG.
 */
export function SlideElement<T extends ElementType>({
  as,
  name,
  references,
  styleNames,
  ...props
}: SlideElementProps<T>): JSX.Element {
  const store = use(SlideElementContext);
  const idOf = (target: string) => store?.idOf(target) ?? target;
  const id = useSlideElementId(name ?? '');
  const ref = useSlideElementRef(name ?? '');
  const resolved = Object.fromEntries(
    Object.entries(references ?? {}).map(([attribute, parts]) => [
      attribute,
      parts
        .map((part) => (typeof part === 'string' ? part : idOf(part[0])))
        .join(''),
    ]),
  );
  const style = (props as { style?: unknown }).style;
  return createElement(as, {
    ...props,
    ...(styleNames === undefined || style === undefined
      ? {}
      : { style: resolveStyle(style, styleNames, idOf) }),
    ...resolved,
    ...(name === undefined ? {} : { id, ref }),
  });
}
